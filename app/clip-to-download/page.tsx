import DLClient from "./client";

export default function ClipToDownload() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  const secondsInDay =
    date.getHours() * 3600 +
    date.getMinutes() * 60 +
    date.getSeconds();

  const ts = `${year}-${month}-${day}-${secondsInDay}`;

  return <DLClient ts={ts} />;
}
