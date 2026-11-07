import { PbsBlock, PbsChecklist, parse, send } from "pi-kit";
import { useState } from "react";

const blocks = parse("```options\n- {title: Small, body: Fewer parts}\n- {title: Large, body: More room}\n```");

export default function Page() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  return (
    <main style={{ font: "16px/1.6 system-ui", maxWidth: "40rem", margin: "2rem auto", padding: "0 1rem" }}>
      <h1>A TSX page</h1>
      <p>It runs in a sandboxed frame, built with this package's React.</p>
      <button type="button" onClick={() => setCount(count + 1)}>
        Clicked {count} times
      </button>
      <button
        type="button"
        onClick={() =>
          send({ clicks: String(count) }).then((reply) =>
            setStatus(reply.accepted ? "sent" : `not sent: ${reply.reason}`),
          )
        }
      >
        Send the count
      </button>
      <p role="status">{status}</p>
      {blocks.map((segment) =>
        segment.type === "block" ? (
          <PbsBlock key={segment.index} segment={segment} onAnswer={(answer) => void send(answer)} />
        ) : null,
      )}
      <PbsChecklist
        data={{
          title: "Ready?",
          items: [
            { name: "tests", label: "Tests pass" },
            { name: "docs", label: "Docs written" },
          ],
        }}
        onAnswer={(answer) => void send(answer)}
      />
    </main>
  );
}
