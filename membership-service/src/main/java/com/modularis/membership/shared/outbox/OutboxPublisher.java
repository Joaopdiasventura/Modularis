package com.modularis.membership.shared.outbox;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.modularis.membership.config.ModularisProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Component
public class OutboxPublisher {
	private static final Logger LOGGER = LoggerFactory.getLogger(OutboxPublisher.class);

	private final OutboxEventRepository outboxEventRepository;
	private final RabbitTemplate rabbitTemplate;
	private final ModularisProperties properties;
	private final ObjectMapper objectMapper;

	public OutboxPublisher(
			OutboxEventRepository outboxEventRepository,
			RabbitTemplate rabbitTemplate,
			ModularisProperties properties,
			ObjectMapper objectMapper
	) {
		this.outboxEventRepository = outboxEventRepository;
		this.rabbitTemplate = rabbitTemplate;
		this.properties = properties;
		this.objectMapper = objectMapper;
	}

	@Scheduled(fixedDelayString = "${modularis.outbox.publish-delay:1s}")
	@Transactional
	public void publishPendingEvents() {
		var pendingEvents = outboxEventRepository.findByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
				OutboxEventStatus.PENDING,
				OffsetDateTime.now(ZoneOffset.UTC),
				PageRequest.of(0, properties.outbox().maxBatchSize())
		);

		for (var event : pendingEvents) {
			try {
				var payload = objectMapper.readTree(event.getPayloadJson());
				var routingKey = event.getRoutingKey();
				LOGGER.info("Publishing async event {} correlationId={}", routingKey, event.getCorrelationId());
				rabbitTemplate.convertAndSend(properties.rabbitmq().eventExchange(), routingKey, payload, message -> {
					message.getMessageProperties().setHeader("x-correlation-id", event.getCorrelationId());
					message.getMessageProperties().setHeader("x-causation-id", event.getCausationId());
					message.getMessageProperties().setHeader("x-event-type", routingKey);
					message.getMessageProperties().setHeader("x-event-version", "1.0.0");
					return message;
				});
				event.markPublished();
			} catch (IOException | RuntimeException ex) {
				LOGGER.warn("Failed to publish outbox event {}", event.getId(), ex);
				event.scheduleRetry();
			}
		}
	}
}
