// On-device transcription (macOS 26+, Speech framework SpeechTranscriber) with per-word timings.
// Fallback for when YouTube subtitles are rate-limited. Usage:
//   ffmpeg -y -i source.mp4 -vn -ac 1 -ar 16000 audio.wav
//   swiftc -O -parse-as-library asr_transcribe.swift -o asr && ./asr audio.wav asr.json
//   python3 alt_transcript.py asr asr.json
// Output asr.json: [[start, end, " word"], ...]. First run may download the en-US speech model.
import Foundation
import Speech
import AVFoundation

@main struct Main {
  static func main() async throws {
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) ?? Locale(identifier: "en-US")
    let tr = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [], attributeOptions: [.audioTimeRange])
    if let req = try await AssetInventory.assetInstallationRequest(supporting: [tr]) {
      FileHandle.standardError.write("installing assets\n".data(using:.utf8)!)
      try await req.downloadAndInstall()
    }
    let analyzer = SpeechAnalyzer(modules: [tr])
    let file = try AVAudioFile(forReading: url)
    let collector = Task {
      var out: [[Any]] = []
      for try await r in tr.results {
        for run in r.text.runs {
          if let tr = run.audioTimeRange {
            let s = String(r.text[run.range].characters)
            out.append([tr.start.seconds, tr.end.seconds, s])
          }
        }
      }
      return out
    }
    if let last = try await analyzer.analyzeSequence(from: file) {
      try await analyzer.finalizeAndFinish(through: last)
    } else { await analyzer.cancelAndFinishNow() }
    let out = try await collector.value
    let data = try JSONSerialization.data(withJSONObject: out)
    FileManager.default.createFile(atPath: CommandLine.arguments[2], contents: data)
    FileHandle.standardError.write("words: \(out.count)\n".data(using:.utf8)!)
  }
}
