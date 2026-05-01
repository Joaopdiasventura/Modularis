package com.modularis.membership.shared.outbox;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface OutboxEventRepository extends JpaRepository<OutboxEventEntity, UUID> {
	List<OutboxEventEntity> findByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
			OutboxEventStatus status,
			OffsetDateTime nextAttemptAt,
			Pageable pageable
	);
}
