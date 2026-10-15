import Foundation
import CoreText
// usage: measure <fontPostscriptName> <size>  ; reads lines from stdin, prints width<TAB>line
let args = CommandLine.arguments
let font = CTFontCreateWithName(args[1] as CFString, CGFloat(Double(args[2])!), nil)
while let line = readLine() {
    let attr = NSAttributedString(string: line, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
    let ctl = CTLineCreateWithAttributedString(attr)
    let w = CTLineGetTypographicBounds(ctl, nil, nil, nil)
    print(String(format: "%.3f", w) + "\t" + line)
}
