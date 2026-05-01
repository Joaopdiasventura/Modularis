package com.modularis.identity.core.identity.application;

import com.modularis.identity.core.identity.domain.OnboardingRequestEntity;
import com.modularis.identity.core.identity.domain.UserCompensationReceiptEntity;
import com.modularis.identity.core.identity.domain.UserEntity;
import com.modularis.identity.core.identity.messaging.UserCompensationCommandMessage;
import com.modularis.identity.core.identity.messaging.UserCompensationCommandPayload;
import com.modularis.identity.core.identity.messaging.UserCreateCommandMessage;
import com.modularis.identity.core.identity.messaging.UserCreateCommandPayload;
import com.modularis.identity.core.identity.persistence.OnboardingRequestRepository;
import com.modularis.identity.core.identity.persistence.UserCompensationReceiptRepository;
import com.modularis.identity.core.identity.persistence.UserRepository;
import com.modularis.identity.shared.errors.ApplicationProblemException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IdentityApplicationServiceTest {
	private UserRepository userRepository;
	private OnboardingRequestRepository onboardingRequestRepository;
	private UserCompensationReceiptRepository userCompensationReceiptRepository;
	private IdentityApplicationService service;

	@BeforeEach
	void setUp() {
		userRepository = mock(UserRepository.class);
		onboardingRequestRepository = mock(OnboardingRequestRepository.class);
		userCompensationReceiptRepository = mock(UserCompensationReceiptRepository.class);
		service = new IdentityApplicationService(
				userRepository,
				onboardingRequestRepository,
				userCompensationReceiptRepository
		);
	}

	@Test
	void replaysExistingUserForSameIdempotencyKey() {
		var user = new UserEntity(UUID.randomUUID(), "john@example.com", "John", "5511", "123");
		var onboardingRequest = new OnboardingRequestEntity("idempotency", "hash", "corr", user);
		when(onboardingRequestRepository.findById("idempotency")).thenReturn(Optional.of(onboardingRequest));

		var result = service.createUser(new UserCreateCommandMessage(
				"1.0.0",
				"msg",
				"corr",
				null,
				"2026-01-01T00:00:00Z",
				"identity.user.create",
				new UserCreateCommandPayload("idempotency", "hash", "john@example.com", "John", "5511", "123")
		));

		assertThat(result.replayed()).isTrue();
		assertThat(result.user().email()).isEqualTo("john@example.com");
	}

	@Test
	void rejectsReusedIdempotencyKeyWithDifferentPayload() {
		var user = new UserEntity(UUID.randomUUID(), "john@example.com", "John", "5511", "123");
		var onboardingRequest = new OnboardingRequestEntity("idempotency", "original-hash", "corr", user);
		when(onboardingRequestRepository.findById("idempotency")).thenReturn(Optional.of(onboardingRequest));

		assertThatThrownBy(() -> service.createUser(new UserCreateCommandMessage(
				"1.0.0",
				"msg",
				"corr",
				null,
				"2026-01-01T00:00:00Z",
				"identity.user.create",
				new UserCreateCommandPayload("idempotency", "other-hash", "john@example.com", "John", "5511", "123")
		))).isInstanceOf(ApplicationProblemException.class);
	}

	@Test
	void compensatesUserOnceAndReplaysNextAttempt() {
		var userId = UUID.randomUUID();
		var user = new UserEntity(userId, "john@example.com", "John", "5511", "123");
		when(userCompensationReceiptRepository.findById("comp-1")).thenReturn(Optional.empty());
		when(userRepository.findById(userId)).thenReturn(Optional.of(user));

		var first = service.compensateUser(new UserCompensationCommandMessage(
				"1.0.0",
				"msg-1",
				"corr-1",
				null,
				"2026-01-01T00:00:00Z",
				"identity.user.compensate",
				new UserCompensationCommandPayload("comp-1", userId.toString(), "payment failed")
		));

		assertThat(first.compensated()).isTrue();
		assertThat(first.replayed()).isFalse();
		verify(onboardingRequestRepository).deleteByUserId(userId);
		verify(userRepository).delete(user);

		when(userCompensationReceiptRepository.findById("comp-1")).thenReturn(
				Optional.of(new UserCompensationReceiptEntity("comp-1", "corr-1", userId))
		);
		var replay = service.compensateUser(new UserCompensationCommandMessage(
				"1.0.0",
				"msg-2",
				"corr-2",
				null,
				"2026-01-01T00:00:01Z",
				"identity.user.compensate",
				new UserCompensationCommandPayload("comp-1", userId.toString(), "payment failed")
		));

		assertThat(replay.compensated()).isTrue();
		assertThat(replay.replayed()).isTrue();
	}
}
