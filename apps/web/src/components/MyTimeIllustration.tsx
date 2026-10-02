import { Download } from './icons';

export type IllustrationFocus = 'flex' | 'import' | null;

/* A drawn likeness of the official My Time (mytime.tietoevry.com): just the parts the welcome
   points at. Labels stay in English, as they appear there. Sized in em off the container width,
   so it scales as one picture. */

function Badge({ n }: { n: number }) {
  return <span className="mti-badge">{n}</span>;
}

export function MyTimeIllustration({
  focus,
  flexValue,
  fileName,
}: {
  focus: IllustrationFocus;
  /** What the user typed as their balance, shown in the card; the example value otherwise. */
  flexValue: string;
  fileName: string;
}) {
  return (
    <figure className="mti-frame" aria-hidden="true">
      <div className="mti" data-focus={focus ?? undefined}>
        <div className="mti-window">
          <div className="mti-chrome">
            <span className="mti-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="mti-address">
              <svg viewBox="0 0 12 12" className="mti-lock">
                <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
                <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
              </svg>
              mytime.tietoevry.com
            </span>
          </div>

          <div className="mti-head">
            <span className="mti-env">PRODUCTION</span>
            <span className="mti-title">
              My Time
              <span className="mti-rounds">
                <i />
                <i />
                <i />
                <i />
              </span>
            </span>
            <nav className="mti-tabs">
              <span className="mti-tab-on">Time cards</span>
              <span>My Projects</span>
              <span>Reports</span>
              <span>Approvals</span>
              <span>Absences</span>
            </nav>
          </div>

          <div className="mti-body">
            <div className="mti-cards">
              <div className="mti-group mti-dim">
                <p className="mti-caption">Overtime limit</p>
                <div className="mti-card mti-split">
                  <div>
                    <p>This month</p>
                    <p className="mti-num">
                      <span className="mti-green">0</span>/60
                    </p>
                  </div>
                  <div>
                    <p>This year</p>
                    <p className="mti-num">
                      <span className="mti-green">4</span>/430
                    </p>
                  </div>
                </div>
              </div>
              <div className="mti-group mti-flex">
                <p className="mti-caption">Flextime balance in total</p>
                <div className="mti-card mti-target">
                  <Badge n={1} />
                  <p>Available</p>
                  <p className="mti-num">{flexValue}</p>
                  <p>hours</p>
                </div>
              </div>
            </div>

            <div className="mti-status mti-dim">
              <b>Time card status:</b> <span className="mti-pill">Modified</span>
            </div>

            <div className="mti-actions">
              <span className="mti-btn mti-export mti-target">
                <Badge n={2} />
                EXPORT
              </span>
              <span className="mti-btn mti-dim">IMPORT</span>
              <span className="mti-btn mti-dim">COPY FROM PREVIOUS WEEK</span>
            </div>
          </div>
        </div>

        <div className="mti-file">
          <svg className="mti-trail" viewBox="0 0 40 60" preserveAspectRatio="none">
            <path d="M8 0 C 8 30, 32 30, 32 60" />
          </svg>
          <span className="mti-chip">
            <Download className="mti-chip-icon" />
            <span className="mti-chip-name">
              {fileName}
            </span>
          </span>
        </div>
      </div>
    </figure>
  );
}
