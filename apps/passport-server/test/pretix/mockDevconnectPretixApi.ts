import {
  DevconnectPretixConfig,
  DevconnectPretixEvent,
  DevconnectPretixItem,
  DevconnectPretixOrder,
  IDevconnectPretixAPI,
} from "../../src/apis/devconnectPretixAPI";
import { logger } from "../../src/util/logger";
import {
  DevconnectPretixDataMocker,
  EVENT_A_CONFIG_ID,
  EVENT_A_ID,
  EVENT_B_CONFIG_ID,
  EVENT_B_ID,
  EVENT_C_CONFIG_ID,
  EVENT_C_ID,
  IMockDevconnectPretixData,
  ITEM_1,
  ITEM_2,
  ORG_CONFIG_ID,
} from "./devconnectPretixDataMocker";

// TODO: move to a separate module, e.g. devconnectPretixApiConfigMockData
export const MOCK_PRETIX_API_CONFIG: DevconnectPretixConfig = {
  organizers: [
    {
      id: ORG_CONFIG_ID,
      orgURL: "organizer-url",
      token: "token",
      events: [
        {
          id: EVENT_A_CONFIG_ID,
          eventID: EVENT_A_ID,
          activeItemIDs: [ITEM_1.toString()],
        },
        {
          id: EVENT_B_CONFIG_ID,
          eventID: EVENT_B_ID,
          activeItemIDs: [ITEM_1.toString(), ITEM_2.toString()],
        },
        {
          id: EVENT_C_CONFIG_ID,
          eventID: EVENT_C_ID,
          activeItemIDs: [],
        },
      ],
    },
  ],
};

export function newMockDevconnectPretixAPI(): IDevconnectPretixAPI {
  const mocker = new DevconnectPretixDataMocker();
  const mockData = mocker.getMockData();
  logger("[MOCK] devconnect pretix data", mockData);
  return getDevconnectMockPretixAPI(mockData);
}

export function getDevconnectMockPretixAPI(
  mockData: IMockDevconnectPretixData
): IDevconnectPretixAPI {
  logger("[MOCK] instantiating mock devconnect pretix api");

  return {
    config: MOCK_PRETIX_API_CONFIG,
    fetchEvent: async (
      _orgURL: string,
      _token: string,
      eventID: string
    ): Promise<DevconnectPretixEvent> => {
      const eventName = mockData.eventNameByEventID.get(eventID);
      if (eventName) {
        return {
          slug: eventID,
          name: { en: eventName },
        };
      }
      throw new Error("404 event not found");
    },
    fetchItems: async (): Promise<DevconnectPretixItem[]> => {
      return [
        { id: ITEM_1, name: { en: "item-1" } },
        {
          id: ITEM_2,
          name: { en: "item-2" },
        },
      ];
    },
    fetchOrders: async (
      _orgUrl: string,
      _token: string,
      eventID: string
    ): Promise<DevconnectPretixOrder[]> => {
      const result = mockData.ordersByEventId.get(eventID) ?? [];
      logger(
        `[MOCK] fetchOrders('${eventID}') =>`,
        JSON.stringify(result, null, 2)
      );
      return result;
    },
  };
}
