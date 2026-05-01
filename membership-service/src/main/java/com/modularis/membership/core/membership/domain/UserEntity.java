package com.modularis.membership.core.membership.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "memberships")
public class UserEntity {

	@Id
	private UUID id;

	@Column(name = "is_premium", nullable = false)
	private boolean premium;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected UserEntity() {
	}

	public UserEntity(UUID id) {
		this.id = id;
		this.premium = false;
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

	public void activatePremium() {
		this.premium = true;
	}

	public UUID getId() {
		return id;
	}

	public boolean isPremium() {
		return premium;
	}
}
