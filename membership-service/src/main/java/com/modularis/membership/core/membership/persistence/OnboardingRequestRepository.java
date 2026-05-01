package com.modularis.membership.core.membership.persistence;

import com.modularis.membership.core.membership.domain.OnboardingRequestEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OnboardingRequestRepository extends JpaRepository<OnboardingRequestEntity, String> {
	@Override
	@EntityGraph(attributePaths = "user")
	Optional<OnboardingRequestEntity> findById(String id);
}
