package com.modularis.membership.shared.messaging;

import com.modularis.membership.config.ModularisProperties;
import com.modularis.membership.core.membership.messaging.UserCreateCommandMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Component
public class RpcResponsePublisher {
	private static final Logger LOGGER = LoggerFactory.getLogger(RpcResponsePublisher.class);

	private final RabbitTemplate rabbitTemplate;
	private final ModularisProperties properties;

	public RpcResponsePublisher(RabbitTemplate rabbitTemplate, ModularisProperties properties) {
		this.rabbitTemplate = rabbitTemplate;
		this.properties = properties;
	}

	public void publish(MessageProperties requestProperties, UserCreateCommandMessage command, Object payload) {
		publish(
				requestProperties,
				command.schemaVersion(),
				command.correlationId(),
				command.messageId(),
				"identity.user.create.response",
				payload
		);
	}

	public void publish(
			MessageProperties requestProperties,
			String schemaVersion,
			String correlationId,
			String causationId,
			String responseType,
			Object payload
	) {
		var responseRoutingKey = headerValue(requestProperties, "x-response-routing-key");
		if (responseRoutingKey == null || responseRoutingKey.isBlank()) {
			LOGGER.warn("Skipping async response because x-response-routing-key header is missing");
			return;
		}

		var responseExchange = headerValue(requestProperties, "x-response-exchange");
		if (responseExchange == null || responseExchange.isBlank()) {
			responseExchange = properties.rabbitmq().responseExchange();
		}

		var envelope = new AsyncMessageEnvelope<>(
				schemaVersion,
				UUID.randomUUID().toString(),
				correlationId,
				causationId,
				OffsetDateTime.now(ZoneOffset.UTC).toString(),
				responseType,
				"user-service",
				payload
		);

		var rpcCorrelationId = requestProperties.getCorrelationId();
		rabbitTemplate.convertAndSend(responseExchange, responseRoutingKey, envelope, message -> {
			message.getMessageProperties().setCorrelationId(rpcCorrelationId);
			message.getMessageProperties().setHeader("x-correlation-id", correlationId);
			message.getMessageProperties().setHeader("x-causation-id", causationId);
			message.getMessageProperties().setHeader("x-event-type", responseType);
			message.getMessageProperties().setHeader("x-event-version", schemaVersion);
			return message;
		});
	}

	private String headerValue(MessageProperties properties, String name) {
		var headers = properties.getHeaders();
		if (headers == null) {
			return null;
		}
		var value = headers.get(name);
		return value instanceof String stringValue ? stringValue : null;
	}
}
