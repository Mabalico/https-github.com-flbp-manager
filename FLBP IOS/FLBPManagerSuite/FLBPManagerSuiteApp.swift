import SwiftUI

@main
struct FLBPManagerSuiteApp: App {
    @UIApplicationDelegateAdaptor(NativeAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
