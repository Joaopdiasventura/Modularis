package com.modularis.membership.core.membership.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.modularis.membership.core.membership.domain.UserEntity;
import com.modularis.membership.core.membership.messaging.PaymentConfirmedEventMessage;
import com.modularis.membership.core.membership.messaging.PaymentConfirmedEventPayload;
import com.modularis.membership.core.membership.messaging.UserCreateCommandMessage;
import com.modularis.membership.core.membership.messaging.UserCreateCommandPayload;
import com.modularis.membership.core.membership.persistence.UserRepository;
import com.modularis.membership.shared.errors.ApplicationProblemException;
import com.modularis.membership.shared.inbox.ConsumedMessageReceiptEntity;
import com.modularis.membership.shared.inbox.ConsumedMessageReceiptRepository;
import com.modularis.membership.shared.outbox.OutboxEventEntity;
import com.modularis.membership.shared.outbox.OutboxEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MembershipApplicationServiceTest {
	private UserRepository userRepository;
	private OutboxEventRepository outboxEventRepository;
	private ConsumedMessageReceiptRepository consumedMessageReceiptRepository;
	private MembershipApplicationService service;

	@BeforeEach
	void setUp() {
		userRepository = mock(UserRepository.class);
		outboxEventRepository = mock(OutboxEventRepository.class);
		consumedMessageReceiptRepository = mock(ConsumedMessageReceiptRepository.class);
		service = new MembershipApplicationService(
				userRepository,
				outboxEventRepository,
				consumedMessageReceiptRepository,
				new ObjectMapper()
		);
	}

	@Test
	void rejectsIdentityCommands() {
		assertThatThrownBy(() -> service.createUser(new UserCreateCommandMessage(
				"1.0.0",
				"msg",
				"corr",
				null,
				"2026-01-01T00:00:00Z",
				"identity.user.create",
				new UserCreateCommandPayload("idempotency", "hash", "john@example.com", "John", "5511", "123")
		))).isInstanceOf(ApplicationProblemException.class);
	}

	@Test
	void enqueuesPremiumUpdateAfterPaymentConfirmation() {
		var userId = UUID.randomUUID();
		when(userRepository.findById(userId)).thenReturn(Optional.empty());
		when(consumedMessageReceiptRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

		service.handlePaymentConfirmed(new PaymentConfirmedEventMessage(
				"1.0.0",
				"payment-message",
				"corr",
				null,
				"2026-01-01T00:00:00Z",
				"payment.confirmed",
				new PaymentConfirmedEventPayload("payment-1", userId.toString(), "COMPLETED", "DELIVERED", "2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z")
		));

		var captor = ArgumentCaptor.forClass(OutboxEventEntity.class);
		verify(outboxEventRepository, org.mockito.Mockito.times(2)).save(captor.capture());
		assertThat(captor.getAllValues()).extracting(OutboxEventEntity::getRoutingKey)
				.containsExactly("membership.premium-activated", "user.premium-updated");

		var receiptCaptor = ArgumentCaptor.forClass(ConsumedMessageReceiptEntity.class);
		verify(consumedMessageReceiptRepository).save(receiptCaptor.capture());
		assertThat(receiptCaptor.getValue().getMessageId()).isEqualTo("payment-confirmed:payment-1");
	}

	@Test
	void deduplicatesPaymentConfirmationByPaymentIdAcrossLegacyAndV1Messages() {
		var userId = UUID.randomUUID();
		var user = new UserEntity(userId);
		when(userRepository.findById(userId)).thenReturn(Optional.of(user));
		Set<String> receipts = new HashSet<>();
		when(consumedMessageReceiptRepository.save(any())).thenAnswer(invocation -> {
			var receipt = invocation.getArgument(0, ConsumedMessageReceiptEntity.class);
			if (!receipts.add(receipt.getMessageId())) {
				throw new DataIntegrityViolationException("duplicate receipt");
			}
			return receipt;
		});

		service.handlePaymentConfirmed(paymentConfirmedEvent("payment.confirmed", "msg-v1", "payment-1", userId));
		service.handlePaymentConfirmed(paymentConfirmedEvent("payment.confirmed", "msg-legacy", "payment-1", userId));

		verify(outboxEventRepository, org.mockito.Mockito.times(2)).save(any());

		var receiptCaptor = ArgumentCaptor.forClass(ConsumedMessageReceiptEntity.class);
		verify(consumedMessageReceiptRepository, org.mockito.Mockito.times(2)).save(receiptCaptor.capture());
		assertThat(receiptCaptor.getAllValues()).extracting(ConsumedMessageReceiptEntity::getMessageId)
				.containsExactly("payment-confirmed:payment-1", "payment-confirmed:payment-1");
	}

	private PaymentConfirmedEventMessage paymentConfirmedEvent(String type, String messageId, String paymentId, UUID userId) {
		return new PaymentConfirmedEventMessage(
				"1.0.0",
				messageId,
				"corr",
				null,
				"2026-01-01T00:00:00Z",
				type,
				new PaymentConfirmedEventPayload(paymentId, userId.toString(), "COMPLETED", "DELIVERED", "2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z")
		);
	}
}
