const ACTIVE_RESERVATION_STATUSES = new Set(["pending", "confirmed", "active"]);

function parseDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function isDateRangeValid(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return Boolean(start && end && end > start);
}

function rangesOverlap(startA, endA, startB, endB) {
  const aStart = parseDate(startA);
  const aEnd = parseDate(endA);
  const bStart = parseDate(startB);
  const bEnd = parseDate(endB);
  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }

  return aStart < bEnd && bStart < aEnd;
}

function hasVehicleConflict(
  reservations,
  candidateReservation,
  ignoredReservationId = null
) {
  if (!candidateReservation || !ACTIVE_RESERVATION_STATUSES.has(candidateReservation.status)) {
    return false;
  }

  return reservations.some((reservation) => {
    if (reservation.id === ignoredReservationId) {
      return false;
    }

    if (reservation.vehicleId !== candidateReservation.vehicleId) {
      return false;
    }

    if (!ACTIVE_RESERVATION_STATUSES.has(reservation.status)) {
      return false;
    }

    return rangesOverlap(
      reservation.startDate,
      reservation.endDate,
      candidateReservation.startDate,
      candidateReservation.endDate
    );
  });
}

module.exports = {
  isDateRangeValid,
  rangesOverlap,
  hasVehicleConflict,
  ACTIVE_RESERVATION_STATUSES,
};
