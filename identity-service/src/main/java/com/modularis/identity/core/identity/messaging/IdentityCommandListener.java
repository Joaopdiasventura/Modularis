package com.modularis.identity.core.identity.messaging;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.modularis.identity.core.identity.application.IdentityApplicationService;
import com.modularis.identity.shared.errors.ApplicationProblemException;
import com.modularis.identity.shared.messaging.RpcErrorResponse;
import com.modularis.identity.shared.messaging.RpcResponsePublisher;
import com.modularis.identity.shared.messaging.RpcSuccessResponse;
import jakarta.validation.Validator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class IdentityCommandListener {
	private static final Logger LOGGER = LoggerFactory.getLogger(IdentityCommandListener.class);

	private final IdentityApplicationService identityApplicationService;
	private final RpcResponsePublisher responsePublisher;
	private final ObjectMapper objectMapper;
	private final Validator validator;

	public IdentityCommandListener(
			IdentityApplicationService identityApplicationService,
			RpcResponsePublisher responsePublisher,
			ObjectMapper objectMapper,
			Validator validator
	) {
		this.identityApplicationService = identityApplicationService;
		this.responsePublisher = responsePublisher;
		this.objectMapper = objectMapper;
		this.validator = validator;
	}

	@RabbitListener(queues = "#{@userCreateQueue.name}")
	public void handleCommand(Message rawMessage) {
		Object response;
		try {
			var root = objectMapper.readTree(rawMessage.getBody());
			var type = root.path("type").asText("");
			switch (type) {
				case "identity.user.create" -> response = handleCreate(rawMessage, root);
				case "identity.user.compensate" -> response = handleCompensation(rawMessage, root);
				default -> response = RpcErrorResponse.of(
						400,
						"Bad Request",
						"unsupported identity command type",
						"UNSUPPORTED_COMMAND"
				);
			}
		} catch (ApplicationProblemException ex) {
			response = RpcErrorResponse.of(ex.getStatus(), ex.getTitle(), ex.getDetail(), ex.getCode());
		} catch (Exception ex) {
			LOGGER.error("Failed to process identity command", ex);
			response = RpcErrorResponse.of(
					500,
					"Internal Server Error",
					"failed to process identity command",
					"USER_COMMAND_FAILED"
			);
		}

		publishFallback(rawMessage, response);
	}

	private Object handleCreate(Message rawMessage, JsonNode root) throws Exception {
		var command = objectMapper.treeToValue(root, UserCreateCommandMessage.class);
		var violations = validator.validate(command);
		if (!violations.isEmpty()) {
			publish(rawMessage, command, RpcErrorResponse.of(
					400,
					"Bad Request",
					"invalid user command payload",
					"INVALID_COMMAND"
			));
			return null;
		}

		LOGGER.info("Consuming async command type={} correlationId={}", command.type(), command.correlationId());
		publish(rawMessage, command, RpcSuccessResponse.of(identityApplicationService.createUser(command)));
		return null;
	}

	private Object handleCompensation(Message rawMessage, JsonNode root) throws Exception {
		var command = objectMapper.treeToValue(root, UserCompensationCommandMessage.class);
		var violations = validator.validate(command);
		if (!violations.isEmpty()) {
			publish(rawMessage, command, RpcErrorResponse.of(
					400,
					"Bad Request",
					"invalid compensation command payload",
					"INVALID_COMMAND"
			));
			return null;
		}

		LOGGER.info("Consuming async command type={} correlationId={}", command.type(), command.correlationId());
		publish(rawMessage, command, RpcSuccessResponse.of(identityApplicationService.compensateUser(command)));
		return null;
	}

	private void publish(Message rawMessage, UserCreateCommandMessage command, Object response) {
		responsePublisher.publish(rawMessage.getMessageProperties(), command, response);
	}

	private void publish(Message rawMessage, UserCompensationCommandMessage command, Object response) {
		responsePublisher.publish(rawMessage.getMessageProperties(), command, response);
	}

	private void publishFallback(Message rawMessage, Object response) {
		if (response == null) {
			return;
		}

		responsePublisher.publish(
				rawMessage.getMessageProperties(),
				headerOrDefault(rawMessage, "x-event-version", "1.0.0"),
				headerOrDefault(rawMessage, "x-correlation-id", rawMessage.getMessageProperties().getCorrelationId()),
				headerOrDefault(rawMessage, "x-causation-id", "identity.user.create"),
				headerOrDefault(rawMessage, "x-event-type", "identity.user.create") + ".response",
				response
		);
	}

	private String headerOrDefault(Message rawMessage, String headerName, String fallback) {
		var value = rawMessage.getMessageProperties().getHeaders().get(headerName);
		return value instanceof String stringValue && !stringValue.isBlank() ? stringValue : fallback;
	}
}
