export const ROLES = ['passenger', 'staff', 'admin'];

/** Where a piece of data came from. Shown next to the data in the UI. */
export const DATA_SOURCES = ['verified', 'simulated', 'predicted', 'cached', 'unknown'];

export const FLIGHT_DATA_SOURCES = ['live', 'cached', 'manual', 'demo', 'unavailable'];

export const FLIGHT_STATUSES = ['SCHEDULED', 'CHECK_IN_OPEN', 'BOARDING', 'DEPARTED', 'IN_AIR', 'DELAYED', 'LANDED', 'CANCELLED', 'UNKNOWN'];

export const FLIGHT_STATUS_LABELS = {
  SCHEDULED: 'Scheduled',
  CHECK_IN_OPEN: 'Check-in open',
  BOARDING: 'Boarding',
  DEPARTED: 'Departed',
  IN_AIR: 'In transit',
  DELAYED: 'Delayed',
  LANDED: 'Landed',
  CANCELLED: 'Cancelled',
  UNKNOWN: 'Unknown',
};

export const INCIDENT_TYPES = ['MISSING', 'DELAYED', 'DAMAGED', 'MISROUTED'];

export const INCIDENT_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];

export const ANOMALY_TYPES = ['DUPLICATE_SCAN', 'INVALID_SEQUENCE', 'MISSING_CHECKPOINT', 'MISSING_SCAN_TIMEOUT', 'FLIGHT_MISMATCH', 'PROLONGED_DWELL', 'REPEATED_SCAN_FAILURES', 'CONFLICTING_STATUS'];

export const SEVERITIES = ['low', 'medium', 'high'];

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED', 'RESOLVED'];

export const NOTIFICATION_KINDS = ['STATUS_CHANGE', 'DELAY_RISK', 'ARRIVAL', 'READY_FOR_COLLECTION', 'INCIDENT_UPDATE', 'SYSTEM'];
