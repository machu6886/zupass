import {
  constructPassportPcdGetRequestUrl,
  openPassportPopup,
  usePassportPopupMessages,
  usePCDMultiplexer,
  usePendingPCD,
  useSemaphoreGroupProof,
} from "@pcd/passport-interface";
import { ArgumentTypeName } from "@pcd/pcd-types";
import {
  generateMessageHash,
  SemaphoreGroupPCDPackage,
} from "@pcd/semaphore-group-pcd";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { useState } from "react";
import { CodeLink, CollapsableCode, HomeLink } from "../../components/Core";
import { ExampleContainer } from "../../components/ExamplePage";
import { PendingPCDStatusDisplay } from "../../components/PendingPCDStatusDisplay";
import {
  ZUPASS_SERVER_URL,
  ZUPASS_URL,
  ZUZALU_SEMAPHORE_GROUP_URL,
} from "../../src/constants";

/**
 * Example page which shows how to use the generic prove screen to
 * request a Semaphore Group Membership PCD as a third party developer.
 */
export default function Page() {
  // Populate PCD from either client-side or server-side proving using passport popup
  const [passportPCDStr, passportPendingPCDStr] = usePassportPopupMessages();
  const [pendingPCDStatus, pendingPCDError, serverPCDStr] = usePendingPCD(
    passportPendingPCDStr,
    ZUPASS_SERVER_URL
  );
  const pcdStr = usePCDMultiplexer(passportPCDStr, serverPCDStr);
  const [valid, setValid] = useState<boolean | undefined>();
  const onVerified = (valid: boolean) => {
    setValid(valid);
  };
  const { proof, group } = useSemaphoreGroupProof(
    pcdStr,
    ZUZALU_SEMAPHORE_GROUP_URL,
    "consumer-client",
    onVerified
  );

  const [debugChecked, setDebugChecked] = useState(false);
  const [serverProving, setServerProving] = useState(false);

  return (
    <>
      <HomeLink />
      <h2>Generic Semaphore Group Membership Proof</h2>
      <p>
        This page shows a working example of an integration with the PCD
        Passport application which requests and verifies that a particular user
        is a member of a particular Semaphore Group.
      </p>
      <p>
        The group we are using for demonstration purposes is the Zuzalu
        Residents group, however this example is intended to be a more generic
        example and to be able to be used for groups and purposes other than
        Zuzalu. To test this flow locally, you should start the local
        development environment with the <code>BYPASS_EMAIL_REGISTRATION</code>{" "}
        environment variable set to <code>true</code>, which allows you to log
        with any string as the email.
      </p>
      <p>
        The underlying PCD that this example uses is{" "}
        <code>SempahoreGroupPCD</code>. You can find more documentation
        regarding this PCD{" "}
        <CodeLink file="/tree/main/packages/semaphore-group-pcd">
          here on GitHub
        </CodeLink>{" "}
        .
      </p>
      <ExampleContainer>
        <button
          onClick={() =>
            requestMembershipProof(
              debugChecked,
              serverProving,
              "consumer-client"
            )
          }
          disabled={valid}
        >
          Request Group Membership Proof
        </button>
        <label>
          <input
            type="checkbox"
            checked={debugChecked}
            onChange={() => {
              setDebugChecked((checked) => !checked);
            }}
          />
          debug view
        </label>
        <label>
          <input
            type="checkbox"
            checked={serverProving}
            onChange={() => {
              setServerProving((checked: boolean) => !checked);
            }}
          />
          server-side proof
        </label>
        {passportPendingPCDStr && (
          <>
            <PendingPCDStatusDisplay
              status={pendingPCDStatus}
              pendingPCDError={pendingPCDError}
            />
          </>
        )}
        {proof != null && (
          <>
            <p>Got Zuzalu Membership Proof from Passport</p>
            <CollapsableCode code={JSON.stringify(proof, null, 2)} />
            {group && <p>✅ Loaded group, {group.members.length} members</p>}
            {valid === undefined && <p>❓ Proof verifying</p>}
            {valid === false && <p>❌ Proof is invalid</p>}
            {valid === true && <p>✅ Proof is valid</p>}
          </>
        )}
        {valid && <p>Welcome, anon</p>}
      </ExampleContainer>
    </>
  );
}

// Show the Passport popup, ask the user to show anonymous membership.
function requestMembershipProof(
  debug: boolean,
  proveOnServer: boolean,
  originalSiteName: string
) {
  const popupUrl = window.location.origin + "/popup";
  const proofUrl = constructPassportPcdGetRequestUrl<
    typeof SemaphoreGroupPCDPackage
  >(
    ZUPASS_URL,
    popupUrl,
    SemaphoreGroupPCDPackage.name,
    {
      externalNullifier: {
        argumentType: ArgumentTypeName.BigInt,
        userProvided: true,
        value: generateMessageHash(originalSiteName).toString(),
        description:
          "You can choose a nullifier to prevent this signed message from being used across domains.",
      },
      group: {
        argumentType: ArgumentTypeName.Object,
        userProvided: false,
        remoteUrl: ZUZALU_SEMAPHORE_GROUP_URL,
        description: "The Semaphore group which you are proving you belong to.",
      },
      identity: {
        argumentType: ArgumentTypeName.PCD,
        pcdType: SemaphoreIdentityPCDPackage.name,
        value: undefined,
        userProvided: true,
        description:
          "The Semaphore Identity which you are signing the message on behalf of.",
      },
      signal: {
        argumentType: ArgumentTypeName.BigInt,
        userProvided: true,
        value: "1",
        description:
          "The message you are signing with your Semaphore identity.",
      },
    },
    {
      genericProveScreen: true,
      description:
        "Generate a group membership proof using your passport's Semaphore Identity.",
      title: "Group Membership Proof",
      debug: debug,
      proveOnServer: proveOnServer,
    }
  );

  openPassportPopup(popupUrl, proofUrl);
}
