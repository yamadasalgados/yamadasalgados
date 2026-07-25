export type CustomerAddressProfile = {
  deliveryAddress: string;
  locationLink: string;
  recipientName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
};

export const EMPTY_CUSTOMER_ADDRESS: CustomerAddressProfile = {
  deliveryAddress: "",
  locationLink: "",
  recipientName: "",
  postalCode: "",
  prefecture: "",
  city: "",
  addressLine1: "",
  addressLine2: "",
};

export function normalizeCustomerAddress(value: unknown): CustomerAddressProfile {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const clean = (field: keyof CustomerAddressProfile, maxLength: number) =>
    typeof raw[field] === "string" ? raw[field].trim().slice(0, maxLength) : "";

  return {
    deliveryAddress: clean("deliveryAddress", 1000),
    locationLink: clean("locationLink", 2000),
    recipientName: clean("recipientName", 120),
    postalCode: clean("postalCode", 30),
    prefecture: clean("prefecture", 120),
    city: clean("city", 160),
    addressLine1: clean("addressLine1", 300),
    addressLine2: clean("addressLine2", 300),
  };
}

export function customerAddressHasValue(address: CustomerAddressProfile): boolean {
  return Object.values(address).some(Boolean);
}
