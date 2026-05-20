---
Task ID: 1
Agent: Super Z (Main)
Task: Fix Cloudstream extension build for AiCurv/aicurv repository

Work Log:
- Cloned the repository from https://github.com/AiCurv/aicurv
- Examined all existing files and compared against official recloudstream/TestPlugins template
- Identified 7+ critical issues causing build failures
- Fixed root build.gradle.kts: added com.lagradost.cloudstream3.gradle plugin, cloudstream stubs dependency, essential libraries (NiceHttp, jsoup, jackson, kotlin-stdlib), changed JVM target from 17 to 1.8, switched gradle plugin to -SNAPSHOT
- Fixed helper function type resolution: changed from extensions.getByName().configuration() to extensions.configure<T>
- Upgraded Kotlin from 2.1.0 to 2.3.0 (Cloudstream pre-release stubs compiled with Kotlin 2.3.0 metadata)
- Added back permissions: contents: write to workflow for GITHUB_TOKEN push access
- Fixed workflow build copy paths to match TestPlugins template
- Fixed repo.json: corrected GitHub org name from aicurv to AiCurv
- Simplified settings.gradle.kts with auto-include pattern
- Adjusted gradle.properties memory settings for CI

Stage Summary:
- Build now passes successfully on GitHub Actions
- builds branch contains HDPornFullProvider.cs3 (2189 bytes) and plugins.json (731 bytes)
- plugins.json properly lists the HDPornFullProvider extension with all metadata
- Repo URL for Cloudstream app: https://github.com/AiCurv/aicurv/raw/main/repo.json
