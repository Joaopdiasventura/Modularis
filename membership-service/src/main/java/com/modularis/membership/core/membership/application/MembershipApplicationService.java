package com.modularis.membership.core.membership.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.modularis.membership.core.membership.domain.UserEntity;
import com.modularis.membership.core.membership.messaging.PaymentConfirmedEventMessage;
import com.modularis.membership.core.membership.messaging.UserCreateCommandMessage;
import com.modularis.membership.core.membership.messaging.UserCreateCommandResult;
import com.modularis.membership.core.membership.messaging.UserPremiumUpdatedEventMessage;
import com.modularis.membership.core.membership.messaging.UserPremiumUpdatedEventPayload;
import com.modularis.membership.core.membership.persistence.UserRepository;
import com.modularis.membership.shared.errors.ApplicationProblemException;
import com.modularis.membership.shared.inbox.ConsumedMessageReceiptEntity;
import com.modularis.membership.shared.inbox.ConsumedMessageReceiptRepository;
import com.modularis.membership.shared.messaging.AsyncMessageEnvelope;
import com.modularis.membership.shared.outbox.OutboxEventEntity;
import com.modularis.membership.shared.outbox.OutboxEventRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Service
public class MembershipApplicationService {
	private final UserRepository userRepository;
	private final OutboxEventRepository outboxEventRepository;
	private final ConsumedMessageReceiptRepository consumedMessageReceiptRepository;
	private final ObjectMapper objectMapper;

	public MembershipApplicationService(
			UserRepository userRepository,
			OutboxEventRepository outboxEventRepository,
			ConsumedMessageReceiptRepository consumedMessageReceiptRepository,
			ObjectMapper objectMapper
	) {
		this.userRepository = userRepository;
		this.outboxEventRepository = outboxEventRepository;
		this.consumedMessageReceiptRepository = consumedMessageReceiptRepository;
		this.objectMapper = objectMapper;
	}

	@Transactional
	public UserCreateCommandResult createUser(UserCreateCommandMessage command) {
		throw new ApplicationProblemException(
				409,
				"Conflict",
				"membership-service does not accept identity creation commands",
				"UNSUPPORTED_COMMAND"
		);
	}

	@Transactional
	public void handlePaymentConfirmed(PaymentConfirmedEventMessage event) {
		var receiptKey = paymentConfirmationReceiptKey(event);
		if (!registerConsumedMessage(receiptKey, event.type(), event.correlationId())) {
			return;
		}

		var userId = UUID.fromString(event.payload().userId());
		var user = userRepository.findById(userId).orElseGet(() -> new UserEntity(userId));
		if (user.isPremium()) {
			return;
		}

		user.activatePremium();
		userRepository.save(user);

		publishOutboxEvent(
				"membership.premium-activated",
				new AsyncMessageEnvelope<>(
						"1.0.0",
						UUID.randomUUID().toString(),
						event.correlationId(),
						event.messageId(),
						OffsetDateTime.now(ZoneOffset.UTC).toString(),
						"membership.premium-activated",
						"membership-service",
						new UserPremiumUpdatedEventPayload(user.getId().toString(), true)
				),
				event
		);
		publishOutboxEvent(
				"user.premium-updated",
				new UserPremiumUpdatedEventMessage(
						"1.0.0",
						UUID.randomUUID().toString(),
						event.correlationId(),
						event.messageId(),
						OffsetDateTime.now(ZoneOffset.UTC).toString(),
						"user.premium-updated",
						new UserPremiumUpdatedEventPayload(user.getId().toString(), true)
				),
				event
		);
	}

	private String toJson(Object value) {
		try {
			return objectMapper.writeValueAsString(value);
		} catch (JsonProcessingException ex) {
			throw new IllegalStateException("Failed to serialize outbox payload", ex);
		}
	}

	private boolean registerConsumedMessage(String messageId, String eventType, String correlationId) {
		try {
			consumedMessageReceiptRepository.save(
					new ConsumedMessageReceiptEntity(
							messageId,
							"membership-service.payment-confirmed",
							eventType,
							correlationId
					)
			);
			return true;
		} catch (DataIntegrityViolationException ex) {
			return false;
		}
	}

	private String paymentConfirmationReceiptKey(PaymentConfirmedEventMessage event) {
		return "payment-confirmed:" + event.payload().paymentId();
	}

	private void publishOutboxEvent(
			String routingKey,
			Object payload,
			PaymentConfirmedEventMessage event
	) {
		outboxEventRepository.save(
				new OutboxEventEntity(
						UUID.randomUUID(),
						routingKey,
						event.correlationId(),
						event.messageId(),
						toJson(payload)
				)
		);
	}
}
