create table memberships (
    id uuid primary key,
    is_premium boolean not null default false,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table onboarding_requests (
    idempotency_key varchar(128) primary key,
    request_hash varchar(128) not null,
    correlation_id varchar(64) not null,
    user_id uuid not null references memberships(id),
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table outbox_events (
    id uuid primary key,
    routing_key varchar(128) not null,
    correlation_id varchar(64) not null,
    causation_id varchar(64),
    payload_json text not null,
    status varchar(16) not null,
    attempts integer not null default 0,
    next_attempt_at timestamptz not null,
    created_at timestamptz not null,
    published_at timestamptz
);

create index outbox_events_status_idx on outbox_events (status, next_attempt_at);
