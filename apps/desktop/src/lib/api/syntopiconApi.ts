import type { SyntopicTopic, SyntopicTopicSummary } from "../types/syntopicon.ts";
import { callBackend } from "./clientBase.ts";

/** Every topic in `vault/syntopicon/topics/`. A vault with no topics gives an empty list. */
export async function getSyntopicTopics(): Promise<SyntopicTopicSummary[]> {
  return callBackend<SyntopicTopicSummary[]>("get_syntopic_topics", undefined, (dev) => dev.getSyntopicTopics());
}

export async function getSyntopicTopic(topicId: string): Promise<SyntopicTopic> {
  return callBackend<SyntopicTopic>("get_syntopic_topic", { topicId }, (dev) => dev.getSyntopicTopic(topicId));
}

/**
 * Creates an empty topic named after `title`, and gives it back with its id. The backend refuses a title whose file a
 * topic already uses, so a new topic never replaces one (DS-12).
 */
export async function createSyntopicTopic(title: string, description: string): Promise<SyntopicTopic> {
  return callBackend<SyntopicTopic>(
    "create_syntopic_topic",
    { title, description },
    (dev) => dev.createSyntopicTopic(title, description)
  );
}

export async function saveSyntopicTopic(topic: SyntopicTopic): Promise<void> {
  return callBackend<void>("save_syntopic_topic", { topic }, (dev) => dev.saveSyntopicTopic(topic));
}

export async function exportSyntopicReport(topicId: string): Promise<string> {
  return callBackend<string>("export_syntopic_report", { topicId }, (dev) => dev.exportSyntopicReport(topicId));
}
