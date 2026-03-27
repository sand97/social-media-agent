import {
  formatNationalNumber,
  getPhoneCountry,
  getPhoneCountryOptions,
  getPhonePlaceholder,
  matchesPhoneCountrySearch,
  normalizeCountryPhoneValue,
  normalizeNationalNumber,
  resolveCountryIsoCode,
  type CountryPhoneValue,
} from '@app/lib/phone/phone-utils'
import { Input, Select } from 'antd'
import { useMemo } from 'react'

import { DEFAULT_PHONE_COUNTRY_CODE } from '../../lib/phone/phone-country-rules'

type CountryPhoneInputProps = {
  defaultCountryCode?: string | null
  disabled?: boolean
  placeholder?: string
  value?: CountryPhoneValue | string | null
  onChange?: (value: CountryPhoneValue) => void
}

type CountrySelectOption = {
  label: string
  searchTokens: string
  value: string
}

function DropdownChevronIcon() {
  return (
    <span className='country-phone-input__chevron' aria-hidden='true'>
      <svg
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M4.46967 7.96967C4.73594 7.7034 5.1526 7.6792 5.44621 7.89705L5.53033 7.96967L12 14.439L18.4697 7.96967C18.7359 7.7034 19.1526 7.6792 19.4462 7.89705L19.5303 7.96967C19.7966 8.23594 19.8208 8.6526 19.6029 8.94621L19.5303 9.03033L12.5303 16.0303C12.2641 16.2966 11.8474 16.3208 11.5538 16.1029L11.4697 16.0303L4.46967 9.03033C4.17678 8.73744 4.17678 8.26256 4.46967 7.96967Z'
          fill='currentColor'
        />
      </svg>
    </span>
  )
}

function getAutocompleteRank(option: CountrySelectOption, inputValue: string) {
  const normalizedInput = inputValue.trim().toLowerCase()
  const normalizedLabel = option.label.toLowerCase()

  if (!normalizedInput) {
    return 0
  }

  if (normalizedLabel.startsWith(normalizedInput)) {
    return 0
  }

  if (normalizedLabel.includes(normalizedInput)) {
    return 1
  }

  return 2
}

export function CountryPhoneInput({
  defaultCountryCode,
  disabled,
  onChange,
  placeholder,
  value,
}: CountryPhoneInputProps) {
  const fallbackCountryCode =
    resolveCountryIsoCode(defaultCountryCode) ?? DEFAULT_PHONE_COUNTRY_CODE
  const normalizedValue = normalizeCountryPhoneValue(value, fallbackCountryCode)
  const selectedCountryCode =
    normalizedValue?.countryIsoCode ?? fallbackCountryCode
  const selectedCountry = getPhoneCountry(selectedCountryCode)
  const phoneDisplayValue = formatNationalNumber(
    normalizedValue?.nationalNumber || '',
    selectedCountryCode
  )
  const countryOptions = useMemo<CountrySelectOption[]>(
    () =>
      getPhoneCountryOptions().map(country => ({
        label: country.label,
        searchTokens: country.searchTokens,
        value: country.code,
      })),
    []
  )

  const emitChange = (nextCountryCode: string, nextNationalNumber: string) => {
    onChange?.({
      countryIsoCode: nextCountryCode,
      nationalNumber: normalizeNationalNumber(nextNationalNumber, nextCountryCode),
    })
  }

  return (
    <div className='country-phone-input'>
      <Select
        showSearch
        disabled={disabled}
        className='country-phone-input__select'
        placeholder='Choisir un pays'
        popupClassName='country-phone-input__dropdown'
        suffixIcon={<DropdownChevronIcon />}
        value={selectedCountryCode}
        options={countryOptions}
        notFoundContent='Aucun pays'
        filterOption={(inputValue, option) =>
          matchesPhoneCountrySearch(
            (option as CountrySelectOption | undefined)?.searchTokens || '',
            inputValue
          )
        }
        filterSort={(leftOption, rightOption, { searchValue }) => {
          const leftRank = getAutocompleteRank(
            leftOption as CountrySelectOption,
            searchValue
          )
          const rightRank = getAutocompleteRank(
            rightOption as CountrySelectOption,
            searchValue
          )

          if (leftRank !== rightRank) {
            return leftRank - rightRank
          }

          return `${leftOption?.label ?? ''}`.localeCompare(
            `${rightOption?.label ?? ''}`,
            'fr',
            { sensitivity: 'base' }
          )
        }}
        onChange={nextCountryCode => {
          emitChange(
            resolveCountryIsoCode(nextCountryCode) ?? fallbackCountryCode,
            normalizedValue?.nationalNumber || ''
          )
        }}
      />

      <Input
        disabled={disabled}
        autoComplete='tel-national'
        inputMode='tel'
        prefix={
          selectedCountry?.dialCode ? (
            <span className='country-phone-input__dial-code'>
              {selectedCountry.dialCode}
            </span>
          ) : null
        }
        className='country-phone-input__number'
        placeholder={placeholder ?? getPhonePlaceholder(selectedCountryCode)}
        value={phoneDisplayValue}
        onChange={event => {
          const nextValue = event.target.value
          const trimmedValue = nextValue.trimStart()

          if (trimmedValue.startsWith('+') || trimmedValue.startsWith('00')) {
            const parsedValue = normalizeCountryPhoneValue(
              nextValue,
              selectedCountryCode
            )

            if (parsedValue) {
              emitChange(
                parsedValue.countryIsoCode,
                parsedValue.nationalNumber || ''
              )
            }

            return
          }

          emitChange(selectedCountryCode, nextValue)
        }}
      />
    </div>
  )
}
