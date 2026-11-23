type SearchItem = { id: number; title: string; text: string };
type SearchRequest = { query: string; items: SearchItem[] };

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const query = event.data.query.trim().toLocaleLowerCase("ru");
  if (!query) {
    self.postMessage({ ids: [] });
    return;
  }
  const ids = event.data.items
    .filter((item) => (item.title + " " + item.text).toLocaleLowerCase("ru").includes(query))
    .map((item) => item.id);
  self.postMessage({ ids });
};
