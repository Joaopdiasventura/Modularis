package com.modularis.identity.shared.messaging;

import com.modularis.identity.config.ModularisProperties;
import com.modularis.identity.core.identity.messaging.UserCompensationCommandMessage;
import com.modularis.identity.core.identity.messaging.UserCreateCommandMessage;
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
				responseTypeFor(command.type()),
				payload
		);
	}

	public void publish(MessageProperties requestProperties, UserCompensationCommandMessage command, Object payload) {
		publish(
				requestProperties,
				command.schemaVersion(),
				command.correlationId(),
				command.messageId(),
				responseTypeFor(command.type()),
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
				"identity-service",
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

	private String responseTypeFor(String commandType) {
		if ("identity.user.create".equals(commandType)) {
			return "identity.user.create.response";
		}
		if ("identity.user.compensate".equals(commandType)) {
			return "identity.user.compensate.response";
		}
		return commandType + ".response";
	}
}
