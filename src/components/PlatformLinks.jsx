export default function PlatformLinks({ show }) {
  if (!show) return null;
  return (
    <div className="platforms">
      {show.spotify && (
        <a className="platform-link" href={show.spotify} target="_blank" rel="noreferrer">
          Spotify
        </a>
      )}
      {show.apple && (
        <a className="platform-link" href={show.apple} target="_blank" rel="noreferrer">
          Apple
        </a>
      )}
    </div>
  );
}
