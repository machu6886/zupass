import {
  CheckInResponse,
  ISSUANCE_STRING,
  IssuedPCDsResponse,
  User,
} from "@pcd/passport-interface";
import { ArgumentTypeName, SerializedPCD } from "@pcd/pcd-types";
import { RSAPCDPackage } from "@pcd/rsa-pcd";
import { RSATicketPCD, RSATicketPCDPackage } from "@pcd/rsa-ticket-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { expect } from "chai";
import "mocha";
import { step } from "mocha-steps";
import NodeRSA from "node-rsa";
import { IEmailAPI } from "../src/apis/emailAPI";
import { stopApplication } from "../src/application";
import { PretixSyncStatus } from "../src/services/types";
import { PCDPass } from "../src/types";
import {
  requestCheckIn,
  requestIssuanceServiceEnabled,
  requestIssuedPCDs,
  requestServerPublicKey,
} from "./issuance/issuance";
import { waitForPretixSyncStatus } from "./pretix/waitForPretixSyncStatus";
import {
  expectCurrentSemaphoreToBe,
  testLatestHistoricSemaphoreGroups,
} from "./semaphore/checkSemaphore";
import { testLoginPCDPass } from "./user/testLoginPCDPass";
import { testUserSync } from "./user/testUserSync";
import { overrideEnvironment, pcdpassTestingEnv } from "./util/env";
import { startTestingApp } from "./util/startTestingApplication";
import { randomEmail } from "./util/util";

describe("pcd-pass functionality", function () {
  this.timeout(15_000);

  const testEmail = randomEmail();
  let application: PCDPass;
  let user: User;
  let identity: Identity;
  let emailAPI: IEmailAPI;
  let publicKey: NodeRSA;

  this.beforeAll(async () => {
    await overrideEnvironment(pcdpassTestingEnv);
    application = await startTestingApp();
  });

  this.afterAll(async () => {
    await stopApplication(application);
  });

  step("should have issuance service running", async function () {
    const status = await requestIssuanceServiceEnabled(application);
    expect(status).to.eq(true);
  });

  step("should not have a pretix service running", async function () {
    const status = await waitForPretixSyncStatus(application);
    expect(status).to.eq(PretixSyncStatus.NoPretix);
  });

  step("email client should be mocked", async function () {
    if (!application.apis.emailAPI) {
      throw new Error("no email client");
    }
    emailAPI = application.apis.emailAPI;
    expect(emailAPI.send).to.be.spy;
  });

  step("should be able to log in", async function () {
    const result = await testLoginPCDPass(application, testEmail, {
      force: false,
      expectUserAlreadyLoggedIn: false,
      expectEmailIncorrect: false,
    });

    if (!result?.user) {
      throw new Error("expected a user");
    }

    user = result.user;
    identity = result.identity;
    expect(emailAPI.send).to.have.been.called.exactly(1);
  });

  step(
    "should not be able to login with invalid email address",
    async function () {
      expect(
        await testLoginPCDPass(application, "test", {
          force: false,
          expectUserAlreadyLoggedIn: false,
          expectEmailIncorrect: true,
        })
      ).to.eq(undefined);
    }
  );

  step("semaphore service should reflect correct state", async function () {
    expectCurrentSemaphoreToBe(application, {
      p: [],
      r: [],
      v: [],
      o: [],
      g: [user.commitment],
    });
    await testLatestHistoricSemaphoreGroups(application);
  });

  step(
    "should not be able to log in a 2nd time without force option",
    async function () {
      expect(
        await testLoginPCDPass(application, testEmail, {
          force: false,
          expectUserAlreadyLoggedIn: true,
          expectEmailIncorrect: false,
        })
      ).to.eq(undefined);

      const result = await testLoginPCDPass(application, testEmail, {
        force: true,
        expectUserAlreadyLoggedIn: true,
        expectEmailIncorrect: false,
      });

      if (!result?.user) {
        throw new Error("exected a user");
      }

      user = result.user;
      identity = result.identity;
      expect(emailAPI.send).to.have.been.called.exactly(2);
    }
  );

  step(
    "semaphore service should now be aware of the new user" +
      " and their old commitment should have been removed",
    async function () {
      expectCurrentSemaphoreToBe(application, {
        p: [],
        r: [],
        v: [],
        o: [],
        g: [user.commitment],
      });
      await testLatestHistoricSemaphoreGroups(application);
    }
  );

  step("user should be able to sync end to end encryption", async function () {
    await testUserSync(application);
  });

  step(
    "anyone should be able to request the server's public key",
    async function () {
      const publicKeyResponse = await requestServerPublicKey(application);
      expect(publicKeyResponse.status).to.eq(200);
      publicKey = new NodeRSA(publicKeyResponse.text, "public");
      expect(publicKey.getKeySize()).to.eq(2048);
      expect(publicKey.isPublic(true)).to.eq(true);
      expect(publicKey.isPrivate()).to.eq(false); // just to be safe
    }
  );

  step(
    "user should be able to be issued some PCDs from the server",
    async function () {
      const response = await requestIssuedPCDs(
        application,
        identity,
        ISSUANCE_STRING
      );
      const responseBody = response.body as IssuedPCDsResponse;

      expect(Array.isArray(responseBody.pcds)).to.eq(true);
      expect(responseBody.pcds.length).to.eq(1);

      const ticketPCD = responseBody.pcds[0];

      expect(ticketPCD.type).to.eq(RSATicketPCDPackage.name);

      const deserializedEmailPCD = await RSATicketPCDPackage.deserialize(
        ticketPCD.pcd
      );

      const verified = await RSATicketPCDPackage.verify(deserializedEmailPCD);
      expect(verified).to.eq(true);

      const pcdPublicKey = new NodeRSA(
        deserializedEmailPCD.proof.rsaPCD.proof.publicKey,
        "public"
      );
      expect(pcdPublicKey.isPublic(true)).to.eq(true);
      expect(pcdPublicKey.isPrivate()).to.eq(false);

      expect(pcdPublicKey.exportKey("public")).to.eq(
        publicKey.exportKey("public")
      );
    }
  );

  step("issued pcds should have stable ids", async function () {
    const expressResponse1 = await requestIssuedPCDs(
      application,
      identity,
      ISSUANCE_STRING
    );
    const expressResponse2 = await requestIssuedPCDs(
      application,
      identity,
      ISSUANCE_STRING
    );
    const response1 = expressResponse1.body as IssuedPCDsResponse;
    const response2 = expressResponse2.body as IssuedPCDsResponse;
    const pcd1 = await RSAPCDPackage.deserialize(response1.pcds[0].pcd);
    const pcd2 = await RSAPCDPackage.deserialize(response2.pcds[0].pcd);
    expect(pcd1.id).to.eq(pcd2.id);
    expect(pcd1.id).to.not.eq(undefined);
    expect(pcd2.id).to.not.eq(undefined);
    // in case we start issuing more pcds, this test should be updated
    expect(response1.pcds.length).to.eq(1);
    expect(response2.pcds.length).to.eq(1);
  });

  step("should be able to check in with a valid ticket", async function () {
    const issueResponse = await requestIssuedPCDs(
      application,
      identity,
      ISSUANCE_STRING
    );
    const issueResponseBody = issueResponse.body as IssuedPCDsResponse;
    const serializedTicket = issueResponseBody
      .pcds[0] as SerializedPCD<RSATicketPCD>;
    const ticket = await RSATicketPCDPackage.deserialize(serializedTicket.pcd);

    const checkinResponse = await requestCheckIn(application, ticket);
    const checkinResponseBody = checkinResponse.body as CheckInResponse;

    expect(checkinResponse.status).to.eq(200);
    expect(checkinResponseBody.success).to.eq(true);
  });

  step(
    "should not able to check in with a ticket not signed by the server",
    async function () {
      const key = new NodeRSA({ b: 2048 });
      const exportedKey = key.exportKey("private");
      const message = "test message";
      const rsaPCD = await RSAPCDPackage.prove({
        privateKey: {
          argumentType: ArgumentTypeName.String,
          value: exportedKey,
        },
        signedMessage: {
          argumentType: ArgumentTypeName.String,
          value: message,
        },
        id: {
          argumentType: ArgumentTypeName.String,
          value: undefined,
        },
      });
      const ticket = await RSATicketPCDPackage.prove({
        id: {
          argumentType: ArgumentTypeName.String,
          value: undefined,
        },
        rsaPCD: {
          argumentType: ArgumentTypeName.PCD,
          value: await RSAPCDPackage.serialize(rsaPCD),
        },
      });

      const checkinResponse = await requestCheckIn(application, ticket);
      expect(checkinResponse.status).to.eq(500);
    }
  );

  step(
    "should not be able to check in with a ticket that has already been used to check in",
    async function () {
      // TODO
      expect(true).to.eq(true);
    }
  );

  step(
    "should not be able to check in with a ticket that has been revoked",
    async function () {
      // TODO
      expect(true).to.eq(true);
    }
  );

  step(
    "shouldn't be able to issue pcds for the incorrect 'issuance string'",
    async function () {
      const expressResponse = await requestIssuedPCDs(
        application,
        identity,
        "asdf"
      );
      const response = expressResponse.body as IssuedPCDsResponse;
      expect(response.pcds).to.deep.eq([]);
    }
  );

  step(
    "shouldn't be able to issue pcds for a user that doesn't exist",
    async function () {
      const expressResponse = await requestIssuedPCDs(
        application,
        new Identity(),
        ISSUANCE_STRING
      );
      const response = expressResponse.body as IssuedPCDsResponse;
      expect(response.pcds).to.deep.eq([]);
    }
  );
});
