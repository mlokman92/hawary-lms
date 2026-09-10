-- KWSP (EPF) as a payment method.
--
-- An Account 2 education withdrawal pays course fees straight from the fund, so
-- staff banking one are not taking cash, a transfer or a card: the money
-- arrives by a route with its own paperwork and its own timing, and filing it
-- under "Other" loses that. Added BEFORE 'other' so the catch-all stays last in
-- the enum's own order, which is the order the picker follows.
alter type public.payment_method add value if not exists 'kwsp' before 'other';
