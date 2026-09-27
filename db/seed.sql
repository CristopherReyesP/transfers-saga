-- Demo accounts for the README walkthrough. Balances are integer minor units,
-- so 100000 USD minor units is 1,000.00 USD.

-- Funded source account for the happy path and every simulated-bank outcome.
INSERT INTO accounts (id, balance_minor, currency)
VALUES ('source-1', 100000, 'USD');

-- Holds 5.00 USD, enough to show the insufficient-funds outcome.
INSERT INTO accounts (id, balance_minor, currency)
VALUES ('low-balance-1', 500, 'USD');

COMMIT;
