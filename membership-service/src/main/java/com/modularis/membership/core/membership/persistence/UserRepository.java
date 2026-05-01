package com.modularis.membership.core.membership.persistence;

import com.modularis.membership.core.membership.domain.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {
}
