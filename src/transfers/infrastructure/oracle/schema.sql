-- Amounts are integer minor units (for example, cents), never floating point.

CREATE TABLE accounts (
  id            VARCHAR2(64 CHAR)  NOT NULL,
  balance_minor NUMBER(19)         NOT NULL,
  currency      CHAR(3 CHAR)       NOT NULL,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT accounts_pk PRIMARY KEY (id),
  CONSTRAINT accounts_balance_ck CHECK (balance_minor >= 0)
);

CREATE TABLE transfers (
  id                  VARCHAR2(64 CHAR)   NOT NULL,
  idempotency_key     VARCHAR2(255 CHAR)  NOT NULL,
  source_account_id   VARCHAR2(64 CHAR)   NOT NULL,
  destination_account VARCHAR2(64 CHAR)   NOT NULL,
  amount_minor        NUMBER(19)          NOT NULL,
  currency            CHAR(3 CHAR)        NOT NULL,
  status              VARCHAR2(16 CHAR)   NOT NULL,
  failure_reason      VARCHAR2(1000 CHAR),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT transfers_pk PRIMARY KEY (id),
  -- The adapter maps a violation of this constraint to DuplicateIdempotencyKey.
  CONSTRAINT transfers_idempotency_key_uk UNIQUE (idempotency_key),
  CONSTRAINT transfers_source_account_fk
    FOREIGN KEY (source_account_id) REFERENCES accounts (id),
  CONSTRAINT transfers_amount_ck CHECK (amount_minor > 0),
  CONSTRAINT transfers_status_ck CHECK (
    status IN (
      'PENDING', 'DEBITED', 'COMPLETED', 'COMPENSATING', 'REVERSED', 'FAILED'
    )
  )
);

CREATE INDEX transfers_source_account_ix ON transfers (source_account_id);
