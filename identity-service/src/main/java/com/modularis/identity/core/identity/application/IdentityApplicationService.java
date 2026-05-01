package com.modularis.identity.core.identity.application;

import com.modularis.identity.core.identity.domain.OnboardingRequestEntity;
import com.modularis.identity.core.identity.domain.UserCompensationReceiptEntity;
import com.modularis.identity.core.identity.domain.UserEntity;
import com.modularis.identity.core.identity.messaging.CompensationCommandResult;
import com.modularis.identity.core.identity.messaging.UserCompensationCommandMessage;
import com.modularis.identity.core.identity.messaging.UserCreateCommandMessage;
import com.modularis.identity.core.identity.messaging.UserCreateCommandResult;
import com.modularis.identity.core.identity.messaging.UserPayload;
import com.modularis.identity.core.identity.persistence.OnboardingRequestRepository;
import com.modularis.identity.core.identity.persistence.UserCompensationReceiptRepository;
import com.modularis.identity.core.identity.persistence.UserRepository;
import com.modularis.identity.shared.errors.ApplicationProblemException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class IdentityApplicationService {
	private final UserRepository userRepository;
	private final OnboardingRequestRepository onboardingRequestRepository;
	private final UserCompensationReceiptRepository userCompensationReceiptRepository;

	public IdentityApplicationService(
			UserRepository userRepository,
			OnboardingRequestRepository onboardingRequestRepository,
			UserCompensationReceiptRepository userCompensationReceiptRepository
	) {
		this.userRepository = userRepository;
		this.onboardingRequestRepository = onboardingRequestRepository;
		this.userCompensationReceiptRepository = userCompensationReceiptRepository;
	}

	@Transactional
	public UserCreateCommandResult createUser(UserCreateCommandMessage command) {
		var payload = command.payload();
		var existing = onboardingRequestRepository.findById(payload.idempotencyKey());
		if (existing.isPresent()) {
			var request = existing.get();
			if (!request.getRequestHash().equals(payload.requestHash())) {
				throw new ApplicationProblemException(
						409,
						"Conflict",
						"Idempotency-Key was already used with a different payload",
						"IDEMPOTENCY_KEY_REUSED"
				);
			}

			return new UserCreateCommandResult(toPayload(request.getUser()), true);
		}

		if (userRepository.existsByEmail(payload.email())) {
			throw new ApplicationProblemException(409, "Conflict", "Email is already registered", "EMAIL_ALREADY_EXISTS");
		}

		if (userRepository.existsByTaxId(payload.taxId())) {
			throw new ApplicationProblemException(409, "Conflict", "Tax ID is already registered", "TAX_ID_ALREADY_EXISTS");
		}

		try {
			var user = userRepository.save(
					new UserEntity(
							UUID.randomUUID(),
							payload.email(),
							payload.name(),
							payload.cellphone(),
							payload.taxId()
					)
			);
			onboardingRequestRepository.save(
					new OnboardingRequestEntity(
							payload.idempotencyKey(),
							payload.requestHash(),
							command.correlationId(),
							user
					)
			);
			return new UserCreateCommandResult(toPayload(user), false);
		} catch (DataIntegrityViolationException ex) {
			throw new ApplicationProblemException(409, "Conflict", "User identity already exists", "USER_IDENTITY_CONFLICT");
		}
	}

	@Transactional
	public CompensationCommandResult compensateUser(UserCompensationCommandMessage command) {
		var payload = command.payload();
		var existingReceipt = userCompensationReceiptRepository.findById(payload.idempotencyKey());
		if (existingReceipt.isPresent()) {
			var receipt = existingReceipt.get();
			if (!receipt.getUserId().toString().equals(payload.userId())) {
				throw new ApplicationProblemException(
						409,
						"Conflict",
						"Idempotency-Key was already used with a different compensation target",
						"IDEMPOTENCY_KEY_REUSED"
				);
			}
			return new CompensationCommandResult(true, true);
		}

		var userId = UUID.fromString(payload.userId());
		var user = userRepository.findById(userId).orElse(null);
		if (user != null && user.isPremium()) {
			throw new ApplicationProblemException(
					409,
					"Conflict",
					"Premium users cannot be compensated through onboarding rollback",
					"USER_ALREADY_PREMIUM"
			);
		}

		userCompensationReceiptRepository.save(
				new UserCompensationReceiptEntity(
						payload.idempotencyKey(),
						command.correlationId(),
						userId
				)
		);
		onboardingRequestRepository.deleteByUserId(userId);
		if (user != null) {
			userRepository.delete(user);
		}

		return new CompensationCommandResult(true, false);
	}

	private UserPayload toPayload(UserEntity user) {
		return new UserPayload(
				user.getId().toString(),
				user.getEmail(),
				user.getName(),
				user.isPremium()
		);
	}
}
