"use client";

import { useMemo, useState } from "react";

function firstNSentences(text: string, n: number) {
  const full = text.trim();

  // Split by sentence endings. Works well for most FMP descriptions.
  const sentences = full.match(/[^.!?]+[.!?]+/g) ?? [full];

  const short = sentences.slice(0, n).join(" ").trim();
  const isTruncated = sentences.length > n && short.length < full.length;

  // Rest is whatever remains after `short` in the original string
  const rest = isTruncated ? full.slice(short.length).trimStart() : "";

  return { full, short, rest, isTruncated };
}

export default function CompanyDescription({
  description,
  sentences = 2,
}: {
  description: string;
  sentences?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const { full, short, rest, isTruncated } = useMemo(
    () => firstNSentences(description, sentences),
    [description, sentences]
  );

  if (!isTruncated) {
    return (
      <p className="mt-4 text-gray-800 leading-relaxed">
        {full}
      </p>
    );
  }

  return (
    <p className="mt-4 text-gray-800 leading-relaxed">
      {expanded ? (
        <>
          {full}{" "}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-blue-600 font-medium hover:underline"
          >
            Show less
          </button>
        </>
      ) : (
        <>
          {short}{" "}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-blue-600 font-medium hover:underline"
          >
            Read more
          </button>
        </>
      )}
    </p>
  );
}