# Whiteboard Party

## WHAT

- Digital whiteboard
- Multiplayer
- Simple

## WHY

- Existing alternatives kind of suck, for one reason or another -- while I need something that **sucks**, big time ;-)
  - GIMP + Screen-sharing
    - Sucks the life out of my poor 2014 Macbook Air
    - It's not multiplayer
  - Microsoft Whiteboard w/ Microsoft Teams
    - The integration is only available for **internal** meetings
    - If you are on a call with someone, and want to use Whiteboard, you got to setup a new meeting, and join that instead
    - If you are on a call with someone outside of your organization (e.g. a candidate), good luck trying to access Microsoft Whiteboard
  - Figma
    - Requires authentication
    - Probably a bit too much for my needs
- Just wanted to have some fun and get my hands dirty and build a _multiplayer_ application

## HOW

- Drawing
  - Big 4000x2000 canvas
  - Users can move around, zoom in / out, at will -- of course they can also draw
  - All the drawing happens on an off-screen graphic, which is then painted on the main canvas when needed
  - Shapes are lists of colored points
  - [p5.js](https://p5js.org/)
- Multiplayer
  - All the users / clients open a WebSocket with the central server node
    - They receive the initial undo/redo history for the current whiteboard
    - They propagate user-issued commands to the server
    - They process serve-replayed commands locally, to keep the undo/redo history in sync
  - Central server keeps track, for each whiteboard, of the undo/redo history of shapes to be drawn
    - It acts as a client (i.e. it needs to update the undo/redo history), without actually drawing anything
    - It replays received commands to all the clients connected to a given Whiteboard
  - [Socket.IO](https://socket.io/)
- Persistency
  - All the whiteboards data lives in the server's memory...mainly
    - We flush this big state object to disk, every 30 seconds
- Privacy
  - Whiteboards are _secret_ rooms, but not _private_
- Extra
  - Hosting: [Replit.com](https://replit.com/@iamFIREcracker/whiteboard-party)

## WHERE

- [Whiteboard.party](https://whiteboard.party)

## WHO

- [Matteo Landi](https://matteolandi.net)
