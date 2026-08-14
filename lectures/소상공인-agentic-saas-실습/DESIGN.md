# IMAGE-LED LECTURE DESIGN

## INTENT

한 장면을 먼저 보고, 짧은 설명문만 읽어도 핵심을 이해하는 덱이다.
이미지는 장식이 아니라 예약 SaaS의 경계·상태·흐름을 기억시키는 주 매체다.
지니는 개발 용어를 그대로 읽지 않고 가게 운영 언어로 번역하는 안내자다.

## VISUAL LANGUAGE

- Premium cinematic isometric miniature diorama
- Matte charcoal void, warm ivory stone, walnut, blackened steel
- Emerald = verified or permitted state
- Muted amber = pending, human review, incomplete setup
- Coral red = blocked path, unsupported boundary
- Warm upper-left key light, restrained edge glow
- No generated text, logos, watermarks, fake terminal, or fake browser chrome

## SLIDE HIERARCHY

1. Eyebrow identifies the teaching beat.
2. Headline states one claim in two lines or fewer.
3. One or two plain-Korean sentences explain why the scene matters.
4. Generated visual occupies 58–82% of the stage.
5. Short HTML labels decode the visible states and boundaries.
6. Speaker notes use Genie's first-person teaching voice.
7. 실행 슬라이드는 한 화면에 한 행동만 두고, 복사 버튼과 성공 표지를 함께 보여 준다.

## IMAGE ROLES

| Slide | Asset | Teaching job |
|---|---|---|
| 01 | `agentic-saas-hero-slot-conflict.png` | One slot, one winner, blocked collision |
| 02 | `genie-introduction-guide.png` | Introduce Genie as the friendly guide |
| 03 | `four-business-capability-constellation.png` | Four domains share the same capability |
| 04 | `reservation-hidden-operating-system.png` | Expose the invariant machinery |
| 05 | `template-to-product-two-planes.png` | Separate code-time generation from runtime |
| 07 | `convex-reactive-transaction-core.png` | Distinguish query, mutation, scheduler |
| 08 | `reservation-lifecycle-guarded-track.png` | Make state transitions and capacity visible |
| 09 | `business-conversation-domain-loom-v2.png` | Show interview inputs becoming bounded config |
| 11 | `offline-scaffold-inject-verify-pipeline.png` | Show the exact offline stop line |
| 12 | `reference-app-product-tour.png` | Orient the reference product surfaces |
| 13 | `post-generation-setup-qa-deploy.png` | Show unfinished post-generation checkpoints |
| 14 | `subscription-vs-booking-payment-boundary.png` | Keep subscription and booking money separate |
| 15 | `takeaway-seven-step-rebuild.png` | Recall the complete rebuild path |

## LAYOUT CONTRACT

- `visual-canvas`: full-width figure with a dark edge mask.
- `visual-split`: compact copy beside a dominant image.
- `visual-overlay`: headline and labels float over safe negative space.
- `plain-explainer`: self-contained explanation in everyday Korean.
- `visual-legend`: short semantic chips that decode the scene.
- Portrait mode stacks copy above image without cropping the teaching object.
- Images use `object-fit: cover`; slide-specific focal positions prevent subject loss.

## ACCESSIBILITY

- Every image has Korean alt text describing the teaching relationship.
- Meaning is never encoded by color alone; labels name states and boundaries.
- Text remains live HTML and selectable.
- Contrast targets WCAG AA against the image mask.
- Motion is unnecessary; no auto-advancing or decorative animation.
- 복사 버튼은 키보드 focus와 텍스트 피드백을 제공한다.

## OFFLINE CONTRACT

- All raster files live in `assets/gen/`.
- STUDENT and INSTRUCTOR packages receive identical image bytes.
- No external URLs, web fonts, image CDNs, or runtime generation.
- Generated visuals explain concepts; they never impersonate verified screenshots.
- Real terminal output and implementation evidence remain HTML where accuracy matters.
