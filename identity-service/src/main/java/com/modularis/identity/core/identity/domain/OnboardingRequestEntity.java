package com.modularis.identity.core.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Entity
@Table(name = "onboarding_requests")
public class OnboardingRequestEntity {

	@Id
	@Column(name = "idempotency_key", length = 128)
	private String idempotencyKey;

	@Column(name = "request_hash", nullable = false, length = 128)
	private String requestHash;

	@Column(name = "correlation_id", nullable = false, length = 64)
	private String correlationId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false)
	private UserEntity user;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected OnboardingRequestEntity() {
	}

	public OnboardingRequestEntity(
			String idempotencyKey,
			String requestHash,
			String correlationId,
			UserEntity user
	) {
		this.idempotencyKey = idempotencyKey;
		this.requestHash = requestHash;
		this.correlationId = correlationId;
		this.user = user;
	}

	@PrePersist
	void onCreate() {
		var now = OffsetDateTime.now(ZoneOffset.UTC);
		this.createdAt = now;
		this.updatedAt = now;
	}

	@PreUpdate
	void onUpdate() {
		this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
	}

	public String getIdempotencyKey() {
		return idempotencyKey;
	}

	public String getRequestHash() {
		return requestHash;
	}

	public UserEntity getUser() {
		return user;
	}
}
