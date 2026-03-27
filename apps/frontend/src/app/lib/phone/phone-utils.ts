import rawCountryCodes from '@app/data/CountryCodes.json'

import {
  DEFAULT_PHONE_COUNTRY_CODE,
  DEFAULT_PHONE_LENGTH_BOUNDS,
  KNOWN_PHONE_RULES,
  PRIORITY_PHONE_COUNTRY_CODES,
} from './phone-country-rules'

type RawCountryPhoneData = {
  code: string
  dial_code: string
  name: string
}

export type CountryPhoneValue = {
  countryIsoCode: string
  nationalNumber: string
}

type LegacyPhoneValue = {
  areaCode?: number | string | null
  countryCode?: number | string | null
  isoCode?: string | null
  phoneNumber?: number | string | null
}

type CountryLookup = {
  code: string
  dialCode: string
  dialDigits: string
  label: string
  name: string
  searchTokens: string
}

const displayNames = (() => {
  try {
    return new Intl.DisplayNames(['fr-FR', 'en-US'], { type: 'region' })
  } catch {
    return null
  }
})()

const priorityCountryRank = new Map(
  PRIORITY_PHONE_COUNTRY_CODES.map((countryCode, index) => [countryCode, index])
)

function toDigits(value: unknown) {
  return `${value ?? ''}`.replace(/\D/g, '')
}

function normalizeCountryCode(value: unknown) {
  return `${value ?? ''}`.trim().toUpperCase()
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
}

function getDisplayCountryName(countryCode: string, fallbackName: string) {
  return displayNames?.of(countryCode) || fallbackName
}

function compareCountries(left: CountryLookup, right: CountryLookup) {
  const leftRank = priorityCountryRank.get(left.code) ?? Number.POSITIVE_INFINITY
  const rightRank =
    priorityCountryRank.get(right.code) ?? Number.POSITIVE_INFINITY

  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }

  return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' })
}

function buildCountries() {
  const dedupedCountries = new Map<string, CountryLookup>()

  for (const rawCountry of rawCountryCodes as RawCountryPhoneData[]) {
    const countryCode = normalizeCountryCode(rawCountry.code)
    const dialDigits = toDigits(rawCountry.dial_code)

    if (!countryCode || !dialDigits || dedupedCountries.has(countryCode)) {
      continue
    }

    const countryName = getDisplayCountryName(countryCode, rawCountry.name)
    const dialCode = `+${dialDigits}`
    const searchTokens = normalizeSearchText(
      [countryCode, countryName, rawCountry.name, dialCode, dialDigits].join(' ')
    )

    dedupedCountries.set(countryCode, {
      code: countryCode,
      dialCode,
      dialDigits,
      label: `${countryName} (${dialCode})`,
      name: countryName,
      searchTokens,
    })
  }

  return Array.from(dedupedCountries.values()).sort(compareCountries)
}

const countries = buildCountries()
const countriesByCode = new Map(countries.map(country => [country.code, country]))
const countryAliases = new Map<string, string>()

for (const country of countries) {
  countryAliases.set(normalizeSearchText(country.code), country.code)
  countryAliases.set(normalizeSearchText(country.name), country.code)
}

function getFallbackCountryCode(countryCode?: string | null) {
  return resolveCountryIsoCode(countryCode) ?? DEFAULT_PHONE_COUNTRY_CODE
}

function getCountryLengthRule(countryCode?: string | null) {
  const normalizedCountryCode = normalizeCountryCode(countryCode)
  const knownRule = KNOWN_PHONE_RULES[normalizedCountryCode]

  return {
    max:
      knownRule?.exactLength ??
      DEFAULT_PHONE_LENGTH_BOUNDS.max,
    min:
      knownRule?.exactLength ??
      DEFAULT_PHONE_LENGTH_BOUNDS.min,
    rule: knownRule,
  }
}

function findCountryFromDialDigits(
  fullNumberDigits: string,
  preferredCountryCode?: string | null
) {
  const preferredCode = getFallbackCountryCode(preferredCountryCode)
  let matchedCountry: CountryLookup | null = null

  for (const country of countries) {
    if (!fullNumberDigits.startsWith(country.dialDigits)) {
      continue
    }

    if (!matchedCountry) {
      matchedCountry = country
      continue
    }

    if (country.dialDigits.length > matchedCountry.dialDigits.length) {
      matchedCountry = country
      continue
    }

    if (country.dialDigits.length < matchedCountry.dialDigits.length) {
      continue
    }

    if (country.code === preferredCode && matchedCountry.code !== preferredCode) {
      matchedCountry = country
      continue
    }

    if (compareCountries(country, matchedCountry) < 0) {
      matchedCountry = country
    }
  }

  return matchedCountry
}

export function resolveCountryIsoCode(value?: string | null) {
  if (!value) {
    return null
  }

  const normalizedCode = normalizeCountryCode(value)
  if (countriesByCode.has(normalizedCode)) {
    return normalizedCode
  }

  return countryAliases.get(normalizeSearchText(value)) ?? null
}

export function getPhoneCountryOptions() {
  return countries
}

export function getPhoneCountry(countryCode?: string | null) {
  return countriesByCode.get(getFallbackCountryCode(countryCode)) ?? null
}

export function getPhoneDialCode(countryCode?: string | null) {
  return getPhoneCountry(countryCode)?.dialCode ?? ''
}

export function getPhonePlaceholder(countryCode?: string | null) {
  const rule = KNOWN_PHONE_RULES[getFallbackCountryCode(countryCode)]
  return rule?.placeholder ?? 'Numéro local'
}

export function normalizeNationalNumber(
  nationalNumber: string,
  countryCode?: string | null
) {
  const normalizedCountryCode = getFallbackCountryCode(countryCode)
  const country = getPhoneCountry(normalizedCountryCode)
  const { max, rule } = getCountryLengthRule(normalizedCountryCode)
  let digits = toDigits(nationalNumber)

  if (
    country?.dialDigits &&
    digits.startsWith(country.dialDigits) &&
    digits.length > max
  ) {
    digits = digits.slice(country.dialDigits.length)
  }

  if (
    rule?.nationalPrefix &&
    digits.startsWith(rule.nationalPrefix) &&
    rule.exactLength &&
    digits.length === rule.exactLength + rule.nationalPrefix.length
  ) {
    digits = digits.slice(rule.nationalPrefix.length)
  }

  if (digits.length > max) {
    digits = digits.slice(0, max)
  }

  return digits
}

export function formatNationalNumber(
  nationalNumber: string,
  countryCode?: string | null
) {
  const normalizedCountryCode = getFallbackCountryCode(countryCode)
  const digits = normalizeNationalNumber(nationalNumber, normalizedCountryCode)
  const rule = KNOWN_PHONE_RULES[normalizedCountryCode]

  if (!rule?.formatGroups?.length) {
    return digits
  }

  const chunks: string[] = []
  let cursor = 0

  for (const groupSize of rule.formatGroups) {
    if (cursor >= digits.length) {
      break
    }

    chunks.push(digits.slice(cursor, cursor + groupSize))
    cursor += groupSize
  }

  if (cursor < digits.length) {
    chunks.push(digits.slice(cursor))
  }

  return chunks.join(' ')
}

function normalizeFromObject(
  value: CountryPhoneValue | LegacyPhoneValue,
  preferredCountryCode?: string | null
) {
  if ('countryIsoCode' in value) {
    const nextCountryCode = getFallbackCountryCode(value.countryIsoCode)

    return {
      countryIsoCode: nextCountryCode,
      nationalNumber: normalizeNationalNumber(
        value.nationalNumber || '',
        nextCountryCode
      ),
    }
  }

  const legacyCountryCode =
    resolveCountryIsoCode(value.isoCode) ??
    findCountryFromDialDigits(toDigits(value.countryCode), preferredCountryCode)
      ?.code ??
    getFallbackCountryCode(preferredCountryCode)

  return {
    countryIsoCode: legacyCountryCode,
    nationalNumber: normalizeNationalNumber(
      `${value.areaCode ?? ''}${value.phoneNumber ?? ''}`,
      legacyCountryCode
    ),
  }
}

function normalizeFromString(value: string, preferredCountryCode?: string | null) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const fallbackCountryCode = getFallbackCountryCode(preferredCountryCode)

  if (trimmedValue.startsWith('+') || trimmedValue.startsWith('00')) {
    const fullNumberDigits = toDigits(trimmedValue)
    const matchedCountry =
      findCountryFromDialDigits(fullNumberDigits, fallbackCountryCode) ??
      getPhoneCountry(fallbackCountryCode)

    if (!matchedCountry) {
      return {
        countryIsoCode: fallbackCountryCode,
        nationalNumber: normalizeNationalNumber(fullNumberDigits, fallbackCountryCode),
      }
    }

    return {
      countryIsoCode: matchedCountry.code,
      nationalNumber: normalizeNationalNumber(
        fullNumberDigits.slice(matchedCountry.dialDigits.length),
        matchedCountry.code
      ),
    }
  }

  return {
    countryIsoCode: fallbackCountryCode,
    nationalNumber: normalizeNationalNumber(trimmedValue, fallbackCountryCode),
  }
}

export function normalizeCountryPhoneValue(
  value?: CountryPhoneValue | LegacyPhoneValue | string | null,
  preferredCountryCode?: string | null
) {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    return normalizeFromString(value, preferredCountryCode)
  }

  return normalizeFromObject(value, preferredCountryCode)
}

export function buildPhoneE164(
  value?: CountryPhoneValue | LegacyPhoneValue | string | null,
  preferredCountryCode?: string | null
) {
  const normalizedValue = normalizeCountryPhoneValue(value, preferredCountryCode)

  if (!normalizedValue?.nationalNumber) {
    return null
  }

  const country = getPhoneCountry(normalizedValue.countryIsoCode)
  if (!country?.dialDigits) {
    return null
  }

  return `+${country.dialDigits}${normalizedValue.nationalNumber}`
}

export function getPhoneCountryLabel(
  value?: CountryPhoneValue | LegacyPhoneValue | string | null,
  preferredCountryCode?: string | null
) {
  const normalizedValue = normalizeCountryPhoneValue(value, preferredCountryCode)
  return getPhoneCountry(
    normalizedValue?.countryIsoCode ?? preferredCountryCode
  )?.name
}

export function getCountryPhoneValidationError(
  value?: CountryPhoneValue | LegacyPhoneValue | string | null,
  options?: {
    defaultCountryCode?: string | null
    requiredMessage?: string
  }
) {
  const requiredMessage =
    options?.requiredMessage ?? 'Veuillez entrer votre numéro.'
  const normalizedValue = normalizeCountryPhoneValue(
    value,
    options?.defaultCountryCode
  )

  if (!normalizedValue?.nationalNumber) {
    return requiredMessage
  }

  const country = getPhoneCountry(normalizedValue.countryIsoCode)
  const { max, min, rule } = getCountryLengthRule(normalizedValue.countryIsoCode)
  const digits = normalizeNationalNumber(
    normalizedValue.nationalNumber,
    normalizedValue.countryIsoCode
  )

  if (rule?.exactLength && digits.length !== rule.exactLength) {
    return `Le numéro pour ${country?.name || 'ce pays'} doit contenir ${rule.exactLength} chiffres.`
  }

  if (digits.length < min) {
    return 'Le numéro saisi est trop court.'
  }

  if (digits.length > max) {
    return 'Le numéro saisi est trop long.'
  }

  return null
}

export function matchesPhoneCountrySearch(optionSearchTokens: string, input: string) {
  return optionSearchTokens.includes(normalizeSearchText(input))
}
