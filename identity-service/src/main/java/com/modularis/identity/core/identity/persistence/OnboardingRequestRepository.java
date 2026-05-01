package com.modularis.identity.core.identity.persistence;

import com.modularis.identity.core.identity.domain.OnboardingRequestEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface OnboardingRequestRepository extends JpaRepository<OnboardingRequestEntity, String> {
	@Override
	@EntityGraph(attributePaths = "user")
	Optional<OnboardingRequestEntity> findById(String id);

	@Modifying
	@Query("delete from OnboardingRequestEntity request where request.user.id = :userId")
	void deleteByUserId(@Param("userId") UUID userId);
}
