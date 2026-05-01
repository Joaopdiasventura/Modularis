package com.modularis.identity.core.identity.domain;

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
@Table(name = "users")
public class UserEntity {

	@Id
	private UUID id;

	@Column(nullable = false, unique = true, length = 255)
	private String email;

	@Column(nullable = false, length = 120)
	private String name;

	@Column(nullable = false, length = 40)
	private String cellphone;

	@Column(name = "tax_id", nullable = false, unique = true, length = 32)
	private String taxId;

	@Column(name = "is_premium", nullable = false)
	private boolean premium;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected UserEntity() {
	}

	public UserEntity(UUID id, String email, String name, String cellphone, String taxId) {
		this.id = id;
		this.email = email;
		this.name = name;
		this.cellphone = cellphone;
		this.taxId = taxId;
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

	public String getEmail() {
		return email;
	}

	public String getName() {
		return name;
	}

	public String getCellphone() {
		return cellphone;
	}

	public String getTaxId() {
		return taxId;
	}

	public boolean isPremium() {
		return premium;
	}
}
