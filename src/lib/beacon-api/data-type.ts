import type { DictionaryDataType, TimestampDataType } from './types';

const STRING_VALUE_TYPES = ['Utf8', 'LargeUtf8', 'Utf8View'];
const NUMERIC_TYPES = [
    'Int8', 'Int16', 'Int32', 'Int64',
    'UInt8', 'UInt16', 'UInt32', 'UInt64',
    'Float16', 'Float32', 'Float64'
];
const DATE_TYPES = ['Date32', 'Date64'];

export function isNumericDataType(dataType: unknown): boolean {
    return typeof dataType === 'string' && NUMERIC_TYPES.includes(dataType);
}

export function isStringDataType(dataType: unknown): boolean {
    return typeof dataType === 'string' && STRING_VALUE_TYPES.includes(dataType);
}

export function isDateDataType(dataType: unknown): boolean {
    return typeof dataType === 'string' && DATE_TYPES.includes(dataType);
}

// The server compares a date column with the same ISO strings as a timestamp column.
export function isTemporalDataType(dataType: unknown): boolean {
    return isTimestampDataType(dataType) || isDateDataType(dataType);
}

export function isTimestampDataType(dataType: unknown): dataType is TimestampDataType {
    return (
        typeof dataType === 'object' &&
        dataType !== null &&
        'Timestamp' in dataType &&
        Array.isArray(dataType.Timestamp)
    );
}

export function isDictionaryDataType(dataType: unknown): dataType is DictionaryDataType {
    return (
        typeof dataType === 'object' &&
        dataType !== null &&
        'Dictionary' in dataType &&
        Array.isArray(dataType.Dictionary) &&
        dataType.Dictionary.length === 2
    );
}

export function isDictionaryOfStrings(dataType: unknown): boolean {
    if (!isDictionaryDataType(dataType)) {
        return false;
    }

    const valueType = dataType.Dictionary[1];

    return typeof valueType === 'string' && STRING_VALUE_TYPES.includes(valueType);
}

export function dataTypeToString(dataType: unknown): string {
    if (typeof dataType === 'string') {
        return dataType;
    }

    if (isTimestampDataType(dataType)) {
        return `Timestamp(${dataType.Timestamp.filter((part) => !!part).join(', ')})`;
    }

    if (isDictionaryDataType(dataType)) {
        const [keyType, valueType] = dataType.Dictionary;

        return `Dictionary(${dataTypeToString(keyType)}, ${dataTypeToString(valueType)})`;
    }

    // An unknown type must never break the column list.
    try {
        return JSON.stringify(dataType) ?? String(dataType);
    } catch {
        return String(dataType);
    }
}
