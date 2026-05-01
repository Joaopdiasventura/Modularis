package com.modularis.identity.core.identity.persistence;

import com.modularis.identity.core.identity.domain.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {
	boolean existsByEmail(String email);

	boolean existsByTaxId(String taxId);

	Optional<UserEntity> findByEmail(String email);
}
