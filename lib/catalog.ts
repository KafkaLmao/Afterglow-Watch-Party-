export const movies = [
  {
    id: 'sintel',
    title: 'Sintel',
    year: 2010,
    genre: 'Fantasy',
    minutes: 15,
    tone: 'A little wonder',
    color: '#ec917c',
    description:
      'A young traveler. An unlikely friendship. A journey to the edge of the world.',
    preview: true,
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    credit: 'Blender Foundation · sintel.org',
  },
  {
    id: 'bunny',
    title: 'Big Buck Bunny',
    year: 2008,
    genre: 'Animation',
    minutes: 10,
    tone: 'Feel-good',
    color: '#b2caa1',
    description:
      'One very big rabbit turns a bad day into a delightfully playful adventure.',
    preview: true,
    url: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    credit: 'Blender Foundation · bigbuckbunny.org',
  },
  {
    id: 'steel',
    title: 'Tears of Steel',
    year: 2012,
    genre: 'Sci-fi',
    minutes: 12,
    tone: 'Something bold',
    color: '#adadcf',
    description:
      'Old love and new machines collide in a cinematic vision of the future.',
    preview: false,
    url: 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov',
    credit: 'Blender Foundation · mango.blender.org',
  },
  {
    id: 'dream',
    title: 'Elephants Dream',
    year: 2006,
    genre: 'Experimental',
    minutes: 11,
    tone: 'A little wonder',
    color: '#c5a37d',
    description:
      'Two explorers lose themselves in a surreal machine of their own making.',
    preview: false,
    url: 'https://download.blender.org/ED/elephantsdream-480-h264-st-aac.mov',
    credit: 'Blender Foundation · orange.blender.org',
  },
] as const;
export type Movie = (typeof movies)[number];
export type MovieId = Movie['id'];

export function matchesSearch(query: string, text: string): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedText = text.toLowerCase();
  if (!normalizedQuery || normalizedText.includes(normalizedQuery)) return true;

  let matchedCharacters = 0;
  for (const character of normalizedText) {
    if (character === normalizedQuery[matchedCharacters]) matchedCharacters++;
  }
  if (matchedCharacters === normalizedQuery.length) return true;

  const allowedDistance = Math.max(1, Math.floor(normalizedQuery.length / 4));
  return normalizedText
    .split(/\W+/)
    .some((word) => editDistance(normalizedQuery, word) <= allowedDistance);
}

function editDistance(query: string, word: string): number {
  const distances = Array.from(
    { length: query.length + 1 },
    (_, index) => index,
  );
  for (let row = 1; row <= word.length; row++) {
    let diagonal = distances[0];
    distances[0] = row;
    for (let column = 1; column <= query.length; column++) {
      const previous = distances[column];
      distances[column] = Math.min(
        distances[column] + 1,
        distances[column - 1] + 1,
        diagonal + (query[column - 1] === word[row - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return distances[query.length];
}
