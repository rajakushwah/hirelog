import { DownloadCards } from "../components/AndroidDownload";

export function GetApp() {
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1 className="page-title">Get the app</h1>
          <span className="sub">Log a round right after the call, snap the whiteboard, and get reminders before every interview.</span>
        </div>
      </div>
      <DownloadCards signedIn />
    </div>
  );
}
