-- Курсор сповіщень по гостю: revision у Syrve рахується окремо для кожного гостя (by_revision вимагає customerId).
-- NULL — гостя ще не «базелайнили»: перший прохід worker лише запам'ятовує стару історію.
ALTER TABLE "guests" ADD COLUMN "last_revision" BIGINT;
