/* globals zoomSdk */
import { useLocation, useHistory } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { apis } from "./apis";
import { Authorization } from "./components/Authorization";
import ApiScrollview from "./components/ApiScrollview";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";

let once = 0; // to prevent increasing number of event listeners being added

function App() {
  const history = useHistory();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [runningContext, setRunningContext] = useState(null);
  const [connected, setConnected] = useState(false);
  const [counter, setCounter] = useState(0);
  const [preMeeting, setPreMeeting] = useState(true); // start with pre-meeting code
  const [userContextStatus, setUserContextStatus] = useState("");

  useEffect(() => {
    async function configureSdk() {
      // to account for the 2 hour timeout for config
      const configTimer = setTimeout(() => {
        setCounter(counter + 1);
      }, 120 * 60 * 1000);

      try {
        // Configure the JS SDK, required to call JS APIs in the Zoom App
        // These items must be selected in the Features -> Zoom App SDK -> Add APIs tool in Marketplace
        const configResponse = await zoomSdk.config({
          capabilities: [
            // apis demoed in the buttons
            ...apis.map((api) => api.name), // IMPORTANT

            // demo events
            "onSendAppInvitation",
            "onShareApp",
            "onActiveSpeakerChange",
            "onMeeting",

            // connect api and event
            "connect",
            "onConnect",
            "postMessage",
            "onMessage",

            // in-client api and event
            "authorize",
            "onAuthorized",
            "promptAuthorize",
            "getUserContext",
            "onMyUserContextChange",
            "sendAppInvitationToAllParticipants",
            "sendAppInvitation",

            // not sure what happens if I pass in duplicate events
            // "allowParticipantToRecord",
            // "cloudRecording",
            // "connect",
            // "expandApp",
            // "getMeetingContext",
            // "getMeetingJoinUrl",
            // "getMeetingParticipants",
            // "getMeetingUUID",
            // "getRecordingContext",
            // "getRunningContext",
            // "getSupportedjsApis",
            // "getUserContext",
            // "listCameras",
            // "onActiveSpeakerChange",
            // "onAuthorized",
            // "onConnect",
            // "onMeeting",
            // "onMessage",
            // "onMyUserContextChange",
            // "onSendAppInvitation",
            // "onShareApp",
            // "openUrl",
            // "postMessage",
            // "promptAuthorize",
            // "removeVirtualBackground",
            // "sendAppInvitation",
            // "shareApp",
            // "showAppInvitationDialog",
            // "sendAppInvitationToMeetingOwner",
            // "sendAppInvitationToAllParticipants",
            // "setVideoMirrorEffect",
            // "setVirtualBackground",
            // "showNotification"
          ],
          version: "0.16.0",
        });
        console.log("App configured", configResponse);
        // The config method returns the running context of the Zoom App
        setRunningContext(configResponse.runningContext);
        setUserContextStatus(configResponse.auth.status);
        zoomSdk.onSendAppInvitation((data) => {
          console.log(data);
        });
        zoomSdk.onShareApp((data) => {
          console.log(data);
        });
      } catch (error) {
        console.log(error);
        setError("There was an error configuring the JS SDK");
      }
      return () => {
        clearTimeout(configTimer);
      };
    }
    configureSdk();
  }, [counter]);

  // PRE-MEETING
  let on_message_handler_client = useCallback(
    (message) => {
      let content = message.payload.payload;
      if (content === "connected" && preMeeting === true) {
        console.log("Meeting instance exists.");
        zoomSdk.removeEventListener("onMessage", on_message_handler_client);
        console.log("Letting meeting instance know client's current state.");
        sendMessage(window.location.hash, "client");
        setPreMeeting(false); // client instance is finished with pre-meeting
      }
    },
    [preMeeting]
  );

  // PRE-MEETING
  useEffect(() => {
    if (runningContext === "inMainClient" && preMeeting === true) {
      zoomSdk.addEventListener("onMessage", on_message_handler_client);
    }
  }, [on_message_handler_client, preMeeting, runningContext]);

  async function sendMessage(msg, sender) {
    console.log(
      "Message sent from " + sender + " with data: " + JSON.stringify(msg)
    );
    console.log("Calling postmessage...", msg);
    await zoomSdk.postMessage({
      payload: msg,
    });
  }

  const receiveMessage = useCallback(
    (receiver, reason = "") => {
      let on_message_handler = (message) => {
        let content = message.payload.payload;
        console.log(
          "Message received " + receiver + " " + reason + ": " + content
        );
        history.push({ pathname: content });
      };
      if (once === 0) {
        zoomSdk.addEventListener("onMessage", on_message_handler);
        once = 1;
      }
    },
    [history]
  );

  useEffect(() => {
    async function connectInstances() {
      // only can call connect when in-meeting
      if (runningContext === "inMeeting") {
        zoomSdk.addEventListener("onConnect", (event) => {
          console.log("Connected");
          setConnected(true);

          // PRE-MEETING
          // first message to send after connecting instances is for the meeting
          // instance to catch up with the client instance
          if (preMeeting === true) {
            console.log("Letting client know meeting instance exists.");
            sendMessage("connected", "meeting");
            console.log("Adding message listener for client's current state.");
            let on_message_handler_mtg = (message) => {
              console.log(
                "Message from client received. Meeting instance updating its state:",
                message.payload.payload
              );
              window.location.replace(message.payload.payload);
              zoomSdk.removeEventListener("onMessage", on_message_handler_mtg);
              setPreMeeting(false); // meeting instance is finished with pre-meeting
            };
            zoomSdk.addEventListener("onMessage", on_message_handler_mtg);
          }
        });

        await zoomSdk.connect();
        console.log("Connecting...");
      }
    }

    if (connected === false) {
      console.log(runningContext, location.pathname);
      connectInstances();
    }
  }, [connected, location.pathname, preMeeting, runningContext]);

  // POST-MEETING
  useEffect(() => {
    async function communicateTabChange() {
      // only proceed with post-meeting after pre-meeting is done
      // just one-way communication from in-meeting to client
      if (runningContext === "inMeeting" && connected && preMeeting === false) {
        sendMessage(location.pathname, runningContext);
      } else if (runningContext === "inMainClient" && preMeeting === false) {
        receiveMessage(runningContext, "for tab change");
      }
    }
    communicateTabChange();
  }, [connected, location, preMeeting, receiveMessage, runningContext]);

  if (error) {
    console.log(error);
    return (
      <div className="App">
        <h1>{error.message}</h1>
      </div>
    );
  }

  return (
    <div className="App">
      <h1>Recovery Host</h1>
      <p>Recovery Host is a Zoom App that aids in the hosting of recovery meetings</p>


      {/* <h3>Links</h3> */}
      <h4>Security</h4>
      <ul>
        <li>Allow all in chat</li>
        <li>Disable participant unmute</li>
      </ul>

      <h3>Script</h3>
      <p>
        Hi Everyone.  I'm ___ and I'm an addict.  My pronouns
        are _____.  Welcome to the Transcendence trans, non-binary,
        and gender non-conforming meeting of Narcotics Anonymous.
      </p>
      <p>
        This is a closed, 60 minute meeting for addicts only
        or for those who think they may have a problem with drugs.
        It costs nothing to belong to our fellowship.
        You're a member when you say you are.
      </p>
      <p>
        Let's open the meeting with a moment of silence for the addict who
        still suffers, followed by the WE version of the Serenity Prayer.
        Can we have that moment now please?
      </p>
      <p>
        <b>
          God, grant us the serenity to accept the things we cannot change,
          courage to change the things we can, and the wisdom to know the difference.
        </b>
      </p>

      <p>May we please have a volunteer to read <button onClick={() => {
        zoomSdk.openUrl({ url: "https://www.na.org/admin/include/spaw2/uploads/pdf/litfiles/us_english/misc/Who%20Is%20an%20Addict.pdf" })
      }}>"Who Is An Addict"?</button></p>

      <p>The format of this meeting is the NA Just For Today.  May we please have a volunteer read from the screen share?</p>
      <button onClick={() => {
        zoomSdk.openUrl({ url: "https://jftna.org/jft/" })
      }}>NA JFT</button>

      <p>7th Tradition states blah blah blah.  Details will be provided in chat.</p>
      <p><button onClick={() => {
        zoomSdk.sendMessage("7th Tradition details....");
      }}>Provide 7th details in chat</button></p>


      <h4>Security</h4>
      <ul>
        <li>Allolw participant unmute</li>
      </ul>
      <p>Now let's share!</p>

      <button onClick={() => {}}>Start Timer</button>

      <button onClick={() => {}}>1 min warning</button>

      <p>...</p>

      <button onClick={() => {
        zoomSdk.openUrl({ url: "https://drive.google.com/file/d/1hwpZ-B3V64sWOqegeZqt4IRxHJ5yJW2s/view" })
      }}>Meeting Slides</button>

      {/* <h1>hi ya{user ? ` ${user.first_name} ${user.last_name}` : " Zoom Apps user"}!</h1> */}
      {/* <p>{`User Context Status: ${userContextStatus}`}</p> */}
      {/* <p>
        {runningContext ?
          `Running Context: ${runningContext}` :
          "Configuring Zoom JavaScript SDK..."
        }
      </p> */}

      {/* <ApiScrollview /> */}
      <Authorization
        handleError={setError}
        handleUserContextStatus={setUserContextStatus}
        handleUser={setUser}
        user={user}
        userContextStatus={userContextStatus}
      />

    </div>
  );
}

export default App;
