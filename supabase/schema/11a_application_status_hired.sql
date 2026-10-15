-- Run on existing DBs that have application_status enum without 'hired'.
-- New installs use 11_applications.sql which includes 'hired'.
-- If you get "already exists", skip (value was already added).

ALTER TYPE application_status ADD VALUE 'hired';
