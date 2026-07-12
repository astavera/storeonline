export type StoreLocationConfig = {
  id: string;
  slug: string;
  name: string;
  address: string;
  locality: string;
  phone: string;
  hours: string;
  pickupEnabled: boolean;
  localDeliveryEnabled: boolean;
  shippingFulfillmentEnabled: boolean;
  notes: string;
};

export const storeLocations: StoreLocationConfig[] = [
  {
    id: "store-3rd-avenue",
    slug: "3rd-avenue",
    name: "3rd Avenue Store",
    address: "1243 3rd Ave., New York, NY 10021",
    locality: "Between 71st & 72nd Streets",
    phone: "212-879-8076",
    hours: "Monday-Sunday, 10:00am-7:00pm",
    pickupEnabled: true,
    localDeliveryEnabled: true,
    shippingFulfillmentEnabled: false,
    notes: "Primary published contact location from the legacy website."
  },
  {
    id: "store-86th-street",
    slug: "86th-street",
    name: "86th Street Store",
    address: "112 East 86th Street, New York, NY 10028",
    locality: "Between Park & Lexington Avenues",
    phone: "212-831-8010",
    hours: "Monday-Sunday, 10:00am-7:00pm",
    pickupEnabled: true,
    localDeliveryEnabled: true,
    shippingFulfillmentEnabled: false,
    notes: "Opened September 6, 2006 according to the legacy content map."
  },
  {
    id: "warehouse",
    slug: "warehouse",
    name: "Warehouse",
    address: "To be configured",
    locality: "Shipping fulfillment outside NYC and local delivery zones",
    phone: "To be configured",
    hours: "Internal operations only",
    pickupEnabled: false,
    localDeliveryEnabled: false,
    shippingFulfillmentEnabled: true,
    notes: "Warehouse address and Square location mapping will be configured later."
  }
];

export function getLocationBySlug(slug: string) {
  return storeLocations.find((location) => location.slug === slug);
}
