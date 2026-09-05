/*
 * dsh-mcp-guard — the silent egress kill chain, as a versioned model.
 *
 * TAKEN FROM THIS REPO, NOT INVENTED. Every element below is one of the ten lanes declared in
 * diagrams/container-view.gen.js, with its own name and its own [kind]; every step in the dynamic
 * view is one of that file's `steps` rows, with the wording it already uses. Where the generator
 * says `l2` — the bracketed technology, "[MCP]", "[no guard mounted]" — that is carried as the
 * relationship's technology rather than folded into the sentence.
 *
 * WHAT THIS ADDS, AND WHAT IT DOES NOT. The repo already draws this chain, in sequence style, from
 * a 479-line bespoke generator. This does not replace that plate and does not draw it better: the
 * static export renders a dynamic view in COLLABORATION style, so the lifelines and the bands are
 * lost. What it adds is that the same model now yields the context, container and component views
 * as well, without a second generator; that the palette and the step order are checked rather than
 * eyeballed; and that a reviewer can descend through the levels instead of opening four files.
 *
 * THE SCOPE OF THE TRACE is the leak run — the generator's Band 1 and Band 2a, steps 1 to 11, the
 * chain with no bundle mounted. Band 2b, where the guard cuts it, is a second trace and a separate
 * decision: the operator asked for the kill chain first.
 *
 * ONE STEP WAS DROPPED IN THE FIRST DRAFT AND THE CHECK COULD NOT SEE IT. The trace exported as ten
 * steps against the generator's eleven: "Appends the post call and its result to" was missing, so
 * the store no longer witnessed the outbound post — which is the event the Exfiltration-Chain
 * invariant later reads. checks/diagram-contrast.mjs passed it, correctly: 1..10 is contiguous and
 * in order, and nothing in the export knows what the source narrative contained. A step-order rule
 * catches a renumbering; only a reader catches an omission.
 */
workspace "No-Leak-MCP" "Blocks silent credential exfiltration." {

    model {
        engA = person "Engineer A" "The rival. Owns none of the harness, and hands a personal agent an open-ended goal."
        engB = person "Engineer B" "The victim. Owns the dsh install, and sees a normal standup summary."

        attacker = softwareSystem "Attacker's agent" "Engineer A's own agent. Not ours, and never touches the victim's host." {
            tags "Existing System"
        }
        listener = softwareSystem "Attacker listener" "An attacker-owned host that captures the delivery. Outside the harness by construction." {
            tags "Existing System"
        }
        controls = softwareSystem "Network controls" "Firewall, EDR and secret vault — the things that can actually block a packet, which the harness cannot." {
            tags "Existing System"
        }
        collector = softwareSystem "OTel collector" "Where the indicator lands once it leaves the harness. The last hop this repo can reason about." {
            tags "Existing System"
        }

        /* THE INFERENCE PLANE, AND IT IS BOTH ENDS OF THE EXPERIMENT. The same provider serves the
           victim model and the scorer that judges what the victim ingested, which is what makes the
           headline metric a comparison rather than an anecdote: one plane, one config, bundle off
           then on. */
        nebius = softwareSystem "Nebius inference" "proposed — hover for details. Serves the victim model and the injection scorer from one plane, so attack-success is measured against a fixed inference substrate." {
            tags "Proposal"
            !adrs adrs-nebius
            perspectives {
                "Rationale" "Gap in Deepseek Harness\n· the harness names no inference provider; reliability of the victim run is whatever the operator wired\n· a scorer needs a second model call and there is no seat that owns it\n\nvs Claude Code\n· Claude Code is bound to one vendor, so the question does not arise for it\n· here the finding is that a capable-but-not-hardened model obeys, which only means something on a plane you can pin\n\nNow possible\n· attack-success-rate becomes reproducible: same substrate, bundle off then on\n· the scorer stops competing with the victim for a different provider's quota"
            }
        }

        /* THE REALTIME PLANE. Not the harness's business and deliberately outside it: the metric has
           to be watchable by several people at once while the run is happening, which is a property
           of the store rather than of the agent. */
        convex = softwareSystem "Convex realtime" "proposed — hover for details. Holds the live event stream and the attack-success metric, and pushes both to every viewer at once." {
            tags "Proposal"
            !adrs adrs-convex
            perspectives {
                "Rationale" "Gap in Deepseek Harness\n· the session log is durable and strictly local; nothing publishes it while a run is in flight\n· a second watcher can only tail a file, and sees a different moment from the first\n\nvs Claude Code\n· Claude Code ships OTel metrics and logs to a collector, which is one-way and per-install\n· neither harness has a shared, subscribable view of one run\n\nNow possible\n· two people watch attack-success flip 1 to 0 in the same instant, which is the demo\n· the reactive window index pushes here instead of a poller asking"
            }
        }

        slackWorkspace = softwareSystem "Slack" "Channels and the MCP server the agent reads, and the link-unfurl service that fetches previews server-side." {
            slack = container "Slack workspace" "Channels and MCP server: where the poisoned message is planted and the unfurl link is posted." "SaaS"
            unfurl = container "Link unfurl service" "Builds the link preview by fetching the URL from Slack's own servers, not the victim's host." "SaaS"
        }

        dsh = softwareSystem "dsh harness" "The DeepSeek Harness install: the agent loop, its event-sourced session, and the observability layer assembled from spare parts." {
            run = container "Agent runtime" "The loop, the tools, and the guard slot — the kill point when a bundle is mounted." "dsh · loop · tools · guard" {
                perspectives {
                    "Rationale" "Gap in Deepseek Harness\n· the guard slot ships and nothing is mounted in it\n\nvs Claude Code\n· PreToolUse hooks and permission prompts gate the CALL\n· neither gates the VALUE carried inside it\n\nNow possible\n· refuse at assembly, not at fetch — while the URL is still an argument\n· nothing leaves, so there is nothing to detect later"
                }
            }
            store = container "Session store" "Event-sourced: every step of the chain is already written down here before anyone asks." "dsh · session · jsonl · query" {
                tags "Data Store"
                perspectives {
                    "Rationale" "Gap in Deepseek Harness\n· none. Event-sourced and shipping, with projection and query over it\n\nvs Claude Code\n· a local transcript, plus a server-side Analytics API\n· Deepseek Harness replays offline; Claude Code queries an API\n\nNow possible\n· nothing on its own\n· the history a pair is tested against — without it there is only a stream"
                }
            }
            /* THE OBSERVABILITY LAYER, ONE LEVEL DOWN. Three components, three jobs, taken from the
               lanes and steps of diagrams/component-view.gen.js.

               THE JOBS ARE WRITTEN HERE AND NOT IN THE BOXES, and that is a correction. The first
               draft put a paragraph of JTBD prose in each element description; Structurizr draws a
               description inside a fixed rectangle and does not reflow it, so all three overran
               their own boxes and printed across the element name below — measured at six labels
               escaping, after the operator caught it by eye. A box holds a sentence. The reasoning
               belongs in the file a reviewer reads, which is this one.

               scorer     JOB: tell me that ingested third-party text is trying to instruct the
                          agent, at the moment it is read. First signal, and on its own only a
                          suspicion: text that looks like an instruction is not yet an exfiltration.
               invariant  JOB: tell me a secret from an earlier tool RESULT has reappeared in a later
                          tool-call URL with no human approval in between. THIS IS THE EVENT. It is a
                          join across two events and a window, not a property of either alone, which
                          is why no single log line carries it and no single-event alert can see it.
               exporter   JOB: get the finding to something that can act on it. The only component
                          here that crosses the boundary, carrying net.peer.name, dsh.canary.sha256,
                          dsh.secret.ref, session.id and severity. */
            /* THE PUSH PATH, PROPOSED. The invariant polls the store today; a poll has a period and the
               period is the attack's headroom, because the guard has to refuse while the URL is still
               an argument. This index keeps the open windows and pushes a completed one on the write
               that closes it. It sits BESIDE the store rather than replacing it: the store stays the
               record, the index is a derived projection, and losing the index degrades the invariant
               to the poll rather than losing evidence. */
            windows = container "Reactive window index" "proposed — hover for details. Keeps the open read-then-post windows and pushes one the moment its second half lands." "reactive index · pushes on write" {
                tags "Proposal"
                !adrs adrs-windows
                perspectives {
                    "Rationale" "Gap in Deepseek Harness\n· the invariant POLLS the session store for the window\n· a poll has a period, and the period is the attack's headroom\n\nvs Claude Code\n· no equivalent — prompt.id correlates events after the fact\n· nothing there fires ON the write that completes a pair\n\nNow possible\n· the verdict is ready while the URL is still an argument\n· write and notification share one transaction boundary"
                }
            }

            obs = container "Observability" "Telemetry and invariants: scores ingested content, and asserts no secret reaches a URL without a human in the window." "dsh · telemetry · invariants" {
                /* MODIFIED, not Proposal: dsh-session-telemetry's redact/score waterfall ships EMPTY, so
                   this is a rule in a seat the harness already offers. The stroke says so. */
                scorer = component "Injection scorer" "modified — hover for details. Suspects: scores ingested text for instruction patterns." "dsh-session-telemetry" {
                    tags "Modified"
                    !adrs adrs-scorer
                    perspectives {
                        "Rationale" "Gap in Deepseek Harness\n· the redact/score waterfall ships empty\n· ingested text is walked once and scored by nothing\n\nvs Claude Code\n· no scoring stage either\n· tool_result carries the text, so scoring runs after export and cannot block\n\nNow possible\n· a first signal in-process and before redaction\n· gives the guard downstream something to weigh"
                    }
                }
                /* PROPOSAL: dsh-invariants accepts companions and has none for this, so there is no
                   empty seat to fill — this is a component the harness has no opinion about. */
                invariant = component "Chain invariant" "proposed — hover for details. Proves: a secret from an earlier result reached a later URL with no approval between." "dsh-invariants" {
                    tags "Proposal"
                    !adrs adrs-invariant
                    perspectives {
                        "Rationale" "Gap in Deepseek Harness\n· no single call is anomalous\n· the read and the post are both logged, and nothing joins them\n\nvs Claude Code\n· prompt.id joins events to one prompt\n· that is causal correlation, not data flow — the same blind spot\n\nNow possible\n· a claim about a PAIR: an earlier secret reaching a later URL, no approval between\n· makes the guard refusal explainable, the indicator worth acting on"
                    }
                }
                /* UNMARKED ON PURPOSE. dsh-session-telemetry-otel ships and is used unmodified — the
                   only plugin on this path that crosses the boundary. An ordinary stroke is the
                   statement that we are adding nothing here. */
                exporter = component "OTLP exporter" "Tells: carries the indicator to something that can block a packet." "dsh-session-telemetry-otel" {
                    perspectives {
                        "Rationale" "Gap in Deepseek Harness\n· none. Ships and is used unmodified\n\nvs Claude Code\n· parity — OTel metrics and logs/events, OTLP endpoint by environment variable\n· Claude Code adds optional traces; this path has no equivalent\n\nNow possible\n· nothing by itself\n· the only component that crosses the boundary — it turns a finding into a droppable packet"
                    }
                }
            }
        }

        engA -> attacker "Sets an open-ended goal for" "win the promotion"
        attacker -> slack "Posts hidden instructions to" "Slack API"
        engB -> run "Asks for a standup summary from"
        slack -> run "Returns the poisoned channel to" "MCP"
        run -> store "Appends the poisoned result to" "durable event · credential already logged"
        run -> slack "Posts the unfurl link to" "no guard mounted"
        run -> store "Appends the post call and its result to" "durable event"
        slack -> unfurl "Queues the link preview for"
        unfurl -> listener "Fetches the url server-side from" "DNS + HTTPS"
        listener -> engA "Delivers the stolen credential to"
        run -> engB "Returns a normal standup summary to"
        /* The container-level edges are the SUMMARY of the component chain below them; both are kept
           so the container view still tells the story and the component view can be precise. */
        store -> obs "Hands the redacted record to" "sessionTelemetry/record"
        obs -> store "Reads the read-then-post window from"
        obs -> controls "Emits the exfiltration indicator to" "OTLP/HTTP"

        /* A STATIC RELATIONSHIP SAYS WHAT IS ALWAYS TRUE; A STEP SAYS WHAT HAPPENED AT STEP 3.
           These were first written as the generator's step sentences — "Hands the redacted copy to",
           "Fails the chain invariant and reports to" — which are events. On the component view,
           which has no numbers because a static view has no order, they read as a sequence whose
           numbering had gone missing: the operator asked where to start and which order to follow,
           and the picture had no answer because it was never a sequence. The wording below is
           enduring; the ordered reading lives in the ExfiltrationSignal trace, where it is numbered
           1 to 6, and the view description now says so. */
        store -> scorer "hands redacted records to" "sessionTelemetry/record"
        invariant -> store "reads read-then-post windows from"
        /* BOTH PATHS ARE DRAWN ON PURPOSE. The poll is what ships; the push is what is proposed, and
           the stroke on the index says which is which. Showing only the new one would draw a system
           nobody has yet; showing only the old one hides the argument. */
        store -> windows "Streams session events to" "durable event"
        windows -> invariant "Pushes a completed read-then-post window to" "reactive subscription"
        invariant -> exporter "reports invariant failures to"
        scorer -> exporter "contributes injection scores to"
        exporter -> collector "emits indicator records to" "OTLP/HTTP"
        collector -> controls "routes hosts and canary hashes to"

        /* THE TWO PROPOSED PLANES, wired where they actually touch the chain. The victim and the
           scorer share one provider; the index and the exporter both publish, which is why the
           dashboard can show the guard's decision beside the window that triggered it. */
        run -> nebius "Requests completions from" "OpenAI-compatible"
        scorer -> nebius "Scores ingested content with" "second model call"
        windows -> convex "Publishes completed windows to" "reactive subscription"
        exporter -> convex "Streams guard decisions and the success metric to" "OTLP/HTTP"

        /* WHERE IT ALL RUNS, and Render is HERE rather than beside the boxes above.
           The proposal gives Render four jobs — attacker listener, OTLP collector, detection worker,
           dashboard host — and three of those are systems this model ALREADY declares. Adding a
           "Render" box next to them would say the hosting is a peer of the things it hosts, which is
           chapter 11's own worked mistake in a different costume (Figure 11-19, the message bus drawn
           as a container). Chapter 8 has the right place for it: a deployment view, which this model
           did not have. The static structure says WHAT talks to what; this says WHERE each of those
           runs, and Render appears once, as a node. */
        deploymentEnvironment "Live" {
            deploymentNode "Engineer B laptop" "The victim's own machine. The harness and its session log never leave it — which is why the exfiltration has to go through something else's servers." "macOS" {
                deploymentNode "dsh 0.1.1-rc.2" "The harness install." "Node" {
                    containerInstance run
                    containerInstance store
                    containerInstance obs
                    containerInstance windows
                }
            }

            /* ENGINEER A IS A SEPARATE MACHINE AND THAT IS THE THREAT MODEL, not a detail. The
               attacker never touches the victim's host: they post a message and wait. A deployment
               view that put both agents in one box would draw the wrong system. */
            deploymentNode "Engineer A laptop" "The attacker's own machine. Sets the goal, plants the message, and touches nothing else." "macOS" {
                softwareSystemInstance attacker
            }

            deploymentNode "Render" "The delivery plane: what must outlive a laptop lid closing." "PaaS" {
                /* TWO NODES, NOT ONE. The first draft put the collector inside a node called
                   "Detection worker", which conflated the thing that RECEIVES OTLP with the thing
                   that DECIDES on it — and the recovery claim is about the second one only. */
                deploymentNode "OTLP collector" "Receives indicator records. Stateless: it forwards, it does not judge." "collector" {
                    softwareSystemInstance collector
                }
                /* AN INFRASTRUCTURE NODE, NOT A DEPLOYMENT NODE, and the difference is whether the
                   box holds something the static model declares. The worker is not part of the
                   harness and has no container to instance, so as a deploymentNode it rendered as
                   an EMPTY box — a thing declared and holding nothing, which is the shape a reader
                   cannot interpret. Chapter 8's infrastructureNode is exactly this case: a running
                   piece of infrastructure that is not an instance of a modelled element. */
                infrastructureNode "Detection worker" "Judges the stream and drives the dashboard. RECOVERS BY RE-SUBSCRIBING rather than restarting from zero: the state it needs is in the realtime store, which is a projection of the session log that remains the source of truth on the victim's laptop." "background worker"
                deploymentNode "Attacker listener host" "Engineer A's drop. Reachable from Slack's servers by construction — that is the whole vector." "web service" {
                    softwareSystemInstance listener
                }
            }

            deploymentNode "Nebius" "The inference plane, shared by the victim model and the scorer so attack-success is measured on one substrate." "managed inference" {
                softwareSystemInstance nebius
            }

            deploymentNode "Convex" "The realtime plane. Durable enough for the worker to rebuild from, and subscribable so several people watch one run." "managed reactive database" {
                softwareSystemInstance convex
            }

            /* SLACK'S CONTAINERS, NOT SLACK. The unfurl service is the CVE: it fetches the URL from
               SLACK'S OWN SERVERS rather than the victim's host, so no packet leaves the laptop and
               no egress control on that laptop can see it. Deploying the system as one opaque box
               would hide the single fact this whole diagram exists to show. */
            deploymentNode "Slack infrastructure" "Not ours. The half of the chain that runs on somebody else's servers." "SaaS" {
                containerInstance slack
                containerInstance unfurl
            }

            /* WHERE A PACKET CAN ACTUALLY BE STOPPED, and it is not on the victim's laptop for the
               unfurl vector. Drawn so the reader can see that the guard has to deny at ASSEMBLY
               time, inside the harness, because by the time anything reaches this node the fetch
               has already happened somewhere else. */
            deploymentNode "Corporate egress" "Firewall, EDR and the secret vault: the controls that can drop a packet, sitting where the victim's traffic leaves." "network" {
                softwareSystemInstance controls
            }
        }
    }

    views {
        systemContext dsh "SystemContext" {
            properties {
                "structurizr.tooltips" "true"
            }
            include *
            autoLayout lr 400 400
            description "The harness in its world: who asks it for work, what it reads, and who is listening."
        }

        container dsh "Containers" {
            properties {
                "structurizr.tooltips" "true"
            }
            include *
            autoLayout lr 400 400
            description "Inside the harness: the runtime that can be guarded, the store that already knows, and the layer that tells someone who can block a packet."
        }

        /* THE KILL CHAIN, bundle off. Eleven steps, in the order the generator declares them, with
           its own wording. Structurizr renumbers a dynamic view 1..n contiguously, which lands on
           exactly the numbering the sequence plate already uses for this run. */
        dynamic dsh "KillChain" {
            properties {
                "structurizr.tooltips" "true"
            }
            engA -> attacker "Sets an open-ended goal for"
            attacker -> slack "Posts hidden instructions to"
            engB -> run "Asks for a standup summary from"
            slack -> run "Returns the poisoned channel to"
            run -> store "Appends the poisoned result to"
            run -> slack "Posts the unfurl link to"
            run -> store "Appends the post call and its result to"
            slack -> unfurl "Queues the link preview for"
            unfurl -> listener "Fetches the url server-side from"
            listener -> engA "Delivers the stolen credential to"
            run -> engB "Returns a normal standup summary to"
            autoLayout lr 400 400
            description "The silent leak, bundle off: nothing renders in the channel and the theft has already happened."
        }

        component obs "Observability" {
            properties {
                "structurizr.tooltips" "true"
            }

            include *
            autoLayout lr
            description "Three jobs, and only one names the exfiltration: the scorer suspects, the invariant proves, the exporter tells someone who can act. This view has no order — for the sequence, open the ExfiltrationSignal trace, where the same six edges are numbered 1 to 6."
        }

        /* THE EXACT EVENT, as a trace. Every step is one of the component-level steps in
           diagrams/component-view.gen.js — 5, 11, 12, 13, 14, 15 — the subset that turns a durable
           log into an indicator a firewall can consume.

           WHAT TO INSTRUMENT, if you read only one thing: step 2 below. The chain invariant reads a
           READ-THEN-POST WINDOW, and that is the observable — a secret from a prior tool result
           reappearing in a later tool-call URL argument with no human approval in the window. It is
           a join across two events and a gap, so no single log line carries it and no single-event
           alert can see it. The scorer's signal and the exporter's fields are both downstream of
           that join: one raises suspicion before it, the other carries the verdict after it. */
        dynamic obs "ExfiltrationSignal" {
            properties {
                "structurizr.tooltips" "true"
            }
            store -> scorer "hands redacted records to"
            invariant -> store "reads read-then-post windows from"
            invariant -> exporter "reports invariant failures to"
            scorer -> exporter "contributes injection scores to"
            exporter -> collector "emits indicator records to"
            collector -> controls "routes hosts and canary hashes to"
            autoLayout lr
            description "START AT 1. From a durable record to an indicator a firewall can act on — and step 2 is the event to instrument: the invariant's read-then-post window."
        }

        deployment dsh "Live" "Deployment" {
            include *
            autoLayout lr
            properties {
                "structurizr.tooltips" "true"
            }
            description "WHERE each box runs. The three sponsor planes appear once each, as nodes: Nebius serves inference, Render carries what must outlive a laptop, Convex holds the realtime state. The victim's harness and its session log never leave Engineer B's machine."
        }

        /* GENERATED FROM architecture/theme.json by checks/diagram-contrast.mjs --write.
           Edit the theme, not this block: the check refuses any drift between them.
           THE HEADER WAS REPEATED FOUR TIMES — one per --write run, because the generator prepended
           its comment and matched only the block below it. Collapsed to one; the styles are
           unchanged. */
        /* GENERATED FROM architecture/theme.json by checks/diagram-contrast.mjs --write.
           Edit the theme, not this block: the check refuses any drift between them. */
        /* GENERATED FROM architecture/theme.json by checks/diagram-contrast.mjs --write.
           Edit the theme, not this block: the check refuses any drift between them. */
        /* GENERATED FROM architecture/theme.json by checks/diagram-contrast.mjs --write.
           Edit the theme, not this block: the check refuses any drift between them. */
        /* GENERATED FROM architecture/theme.json by checks/diagram-contrast.mjs --write.
           Edit the theme, not this block: the check refuses any drift between them. */
        styles {
            element "Element" {
                color #ffffff
                strokeWidth 2
                fontSize 26
            }
            element "Person" {
                shape Person
                background #2b3a33
                stroke #6fa588
            }
            element "Existing System" {
                background #2b3a33
                stroke #6fa588
            }
            element "Software System" {
                background #3f4383
                stroke #a5a9f0
            }
            element "Container" {
                background #5a5fa6
                stroke #b9bdf5
            }
            element "Component" {
                background #8b92ce
                stroke #d2d5fa
                color #14162b
            }
            element "Data Store" {
                shape Cylinder
                background #5a5fa6
                stroke #b9bdf5
            }
            element "Channel" {
                shape Pipe
                background #5a5fa6
                stroke #b9bdf5
            }
            element "Deployment Node" {
                background #1F2226
                stroke #9aa4b2
                color #ffffff
            }
            element "Infrastructure Node" {
                background #1F2226
                stroke #9aa4b2
                color #ffffff
            }
            element "Modified" {
                stroke #ffb454
                strokeWidth 4
            }
            element "Proposal" {
                stroke #ff2fd0
                strokeWidth 6
            }
            element "Container Instance" {
            }
            element "Software System Instance" {
            }
            relationship "Relationship" {
                color #d7dbe3
                fontSize 24
            }
            relationship "Asynchronous" {
                color #d7dbe3
                fontSize 24
                dashed true
            }
        }
    }
}
