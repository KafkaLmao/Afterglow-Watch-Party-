import type { CSSProperties } from 'react';
import type { Movie } from '../lib/catalog';
export function Artwork({
  movie,
  hero = false,
}: {
  movie: Movie;
  hero?: boolean;
}) {
  return (
    <div
      className={`artwork art-${movie.id} ${hero ? 'hero-art' : ''}`}
      style={
        { '--art-color': movie.color } as CSSProperties & {
          '--art-color': string;
        }
      }
    >
      <div className="art-grain" />
      <svg viewBox="0 0 600 450" aria-hidden="true">
        <defs>
          <linearGradient id={`sky-${movie.id}`} x2="0" y2="1">
            <stop stopColor={movie.color} />
            <stop offset="1" stopColor="#172e31" />
          </linearGradient>
        </defs>
        <rect width="600" height="450" fill={`url(#sky-${movie.id})`} />
        <circle cx="390" cy="130" r="58" fill="#fff5d5" opacity=".8" />
        <path
          d="M0 310L120 155L215 295L310 170L450 330L535 215L600 300V450H0Z"
          fill="#355252"
        />
        <path
          d="M0 370L155 280L300 385L430 270L600 385V450H0Z"
          fill="#1b3638"
        />
        <path
          d="M260 450L308 327L326 327L320 450Z"
          fill="#c89170"
          opacity=".6"
        />
        <path
          d="M310 349L306 304L310 285L320 285L326 309L321 349Z"
          fill="#11282a"
        />
        <circle cx="315" cy="279" r="7" fill="#11282a" />
        <path
          d="M70 450L84 285L95 450M30 362L87 253L146 363M45 325L86 218L128 325M465 450L480 320L493 450M432 380L480 279L530 380"
          fill="#10292c"
        />
        <g fill="#fff5dc" opacity=".6">
          <circle cx="84" cy="100" r="1.5" />
          <circle cx="188" cy="75" r="2" />
          <circle cx="300" cy="46" r="1.5" />
          <circle cx="510" cy="60" r="2" />
        </g>
      </svg>
      <div className="art-word">
        <small>BLENDER FOUNDATION PRESENTS</small>
        <strong>{movie.title}</strong>
        <span>
          {movie.genre.toUpperCase()} · {movie.year}
        </span>
      </div>
    </div>
  );
}
