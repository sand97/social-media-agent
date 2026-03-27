export type KnownPhoneRule = {
  exactLength?: number
  formatGroups?: number[]
  nationalPrefix?: string
  placeholder: string
}

export const DEFAULT_PHONE_COUNTRY_CODE = 'CM'

export const PRIORITY_PHONE_COUNTRY_CODES = [
  'CM',
  'CI',
  'SN',
  'TG',
  'BJ',
  'BF',
  'GA',
  'CG',
  'CD',
  'DZ',
  'MA',
  'TN',
  'FR',
  'BE',
  'CH',
  'CA',
  'US',
  'BR',
  'MX',
]

export const DEFAULT_PHONE_LENGTH_BOUNDS = {
  max: 15,
  min: 4,
}

// Only enforce strict lengths for countries we have explicitly reviewed.
export const KNOWN_PHONE_RULES: Record<string, KnownPhoneRule> = {
  CA: {
    exactLength: 10,
    formatGroups: [3, 3, 4],
    placeholder: '201 555 0123',
  },
  CM: {
    exactLength: 9,
    formatGroups: [1, 2, 2, 2, 2],
    placeholder: '6 12 34 56 78',
  },
  FR: {
    exactLength: 9,
    formatGroups: [1, 2, 2, 2, 2],
    nationalPrefix: '0',
    placeholder: '6 12 34 56 78',
  },
  US: {
    exactLength: 10,
    formatGroups: [3, 3, 4],
    placeholder: '201 555 0123',
  },
}
