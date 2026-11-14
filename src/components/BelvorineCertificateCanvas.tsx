import React from 'react';
import {
  IssuedCertificateRecord,
  formatCertificateStampDate,
  buildCertificateVerifyUrl,
  generateQrCodeSvg,
} from '../services/certificateService';

interface BelvorineCertificateCanvasProps {
  certificate: IssuedCertificateRecord;
  certRef?: React.RefObject<HTMLDivElement | null>;
}

export const BelvorineCertificateCanvas: React.FC<BelvorineCertificateCanvasProps> = ({
  certificate,
  certRef,
}) => {
  const verifyUrl = buildCertificateVerifyUrl(certificate);
  const qrSvg = generateQrCodeSvg(verifyUrl);
  const formattedDate = formatCertificateStampDate(certificate.issuedAt);

  // Render award text with <small>(...)</small> for parenthetical level suffix just like js/certificate.js
  const renderAwardNodes = (awardText: string) => {
    const match = awardText.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (!match) {
      return awardText;
    }
    return (
      <>
        {match[1]} <small>({match[2]})</small>
      </>
    );
  };

  return (
    <div className="belvorine-cert-root">
      <style>{`
        .belvorine-cert-root * {
          box-sizing: border-box;
        }
        .belvorine-cert-root .cert {
          color: #1d1d1f;
          font-family: 'Jost', 'Poppins', 'Liberation Sans', Arial, sans-serif;
          line-height: normal;
          text-align: left;
          position: relative;
          width: 1123px;
          height: 794px;
          background: #ffffff;
          transform-origin: top center;
          overflow: hidden;
          user-select: none;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .belvorine-cert-root .frame {
          position: absolute;
          inset: 22px;
          border: 3px solid #c8102e;
          pointer-events: none;
        }
        .belvorine-cert-root .frame::after {
          content: "";
          position: absolute;
          inset: 7px;
          border: 1px solid #c8102e;
          opacity: 0.55;
        }
        .belvorine-cert-root .wm {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .belvorine-cert-root .wmt {
          font: 600 15px 'Jost', Arial, sans-serif;
          letter-spacing: 0.35em;
          fill: #26418f;
          opacity: 0.05;
        }
        .belvorine-cert-root .inner {
          position: absolute;
          inset: 22px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 42px 60px 0;
        }
        .belvorine-cert-root .brand {
          font: 700 58px/1 'Bodoni Moda', 'Playfair Display', 'GFS Baskerville', 'Liberation Serif', serif;
          color: #c8102e;
          letter-spacing: 0.07em;
        }
        .belvorine-cert-root .sub {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 10px;
          color: #c8102e;
          font: 400 13px 'Bodoni Moda', 'GFS Baskerville', serif;
          letter-spacing: 0.5em;
        }
        .belvorine-cert-root .sub i {
          display: block;
          width: 84px;
          height: 1px;
          background: #c8102e;
        }
        .belvorine-cert-root .cert-h1 {
          margin: 34px 0 0;
          font: italic 700 70px/1.1 'Playfair Display', 'Lora', 'Liberation Serif', serif;
          color: #141414;
        }
        .belvorine-cert-root .lead {
          margin-top: 28px;
          font-size: 21px;
          font-weight: 400;
          color: #1d1d1f;
        }
        .belvorine-cert-root .name {
          margin-top: 6px;
          font-size: 44px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #1d1d1f;
          text-align: center;
          max-width: 880px;
        }
        .belvorine-cert-root .txt {
          margin-top: 8px;
          font-size: 21px;
          line-height: 1.3;
          text-align: center;
          max-width: 900px;
          color: #1d1d1f;
        }
        .belvorine-cert-root .award {
          margin-top: 18px;
          font-size: 38px;
          font-weight: 700;
          letter-spacing: -0.01em;
          text-align: center;
          color: #1d1d1f;
        }
        .belvorine-cert-root .award small {
          font-weight: 600;
          font-size: 0.72em;
        }
        .belvorine-cert-root .photo-frame {
          position: absolute;
          top: 52px;
          right: 58px;
          width: 106px;
          height: 126px;
          padding: 3px;
          background: #ffffff;
          border: 2px solid #c8102e;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          z-index: 4;
        }
        .belvorine-cert-root .photo-frame-inner {
          width: 100%;
          height: 100%;
          border: 1px solid rgba(200, 16, 46, 0.5);
          overflow: hidden;
          background: #f8f7f5;
        }
        .belvorine-cert-root .photo-frame-inner img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .belvorine-cert-root .bottom {
          position: absolute;
          left: 46px;
          right: 46px;
          bottom: 52px;
          display: grid;
          grid-template-columns: 190px 240px 170px 1fr 130px;
          align-items: end;
          gap: 6px;
        }
        .belvorine-cert-root .cell {
          text-align: center;
          font-size: 13px;
          font-weight: 600;
          color: #1d1d1f;
        }
        .belvorine-cert-root .cell .line {
          height: 1px;
          background: #222222;
          margin: 2px 0 6px;
        }
        .belvorine-cert-root .stamp {
          width: 150px;
          height: 150px;
          margin: 0 auto 6px;
          display: block;
        }
        .belvorine-cert-root .st-arc {
          font: 600 11px 'Jost', Arial, sans-serif;
          letter-spacing: 0.14em;
        }
        .belvorine-cert-root .st-date {
          font: 700 14px 'Jost', Arial, sans-serif;
        }
        .belvorine-cert-root .st-lab {
          font: 600 9px 'Jost', Arial, sans-serif;
        }
        .belvorine-cert-root .sign {
          width: 240px;
          height: 78px;
          display: block;
          margin: 0 auto;
        }
        .belvorine-cert-root .pname {
          font: 600 17px 'Jost', Arial, sans-serif;
          letter-spacing: 0.03em;
          margin-top: 2px;
          color: #1d1d1f;
        }
        .belvorine-cert-root .prole {
          font: 400 11px 'Jost', Arial, sans-serif;
          color: #555555;
          margin-top: 1px;
        }
        .belvorine-cert-root .seal {
          width: 150px;
          height: 150px;
          margin: 0 auto -4px;
          display: block;
        }
        .belvorine-cert-root .seal-v {
          font: 700 17px 'Jost', Arial, sans-serif;
          fill: #1b6a34;
        }
        .belvorine-cert-root .seal-s {
          font: 600 8.5px 'Jost', Arial, sans-serif;
          fill: #1b6a34;
        }
        .belvorine-cert-root .idbox {
          font: 600 15px 'Jost', Arial, sans-serif;
          letter-spacing: 0.02em;
          margin-bottom: 2px;
          color: #1d1d1f;
        }
        .belvorine-cert-root .qr {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .belvorine-cert-root .qr .code {
          width: 96px;
          height: 96px;
          padding: 4px;
          background: #ffffff;
          border: 1px solid #d9d4d0;
        }
        .belvorine-cert-root .qr svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .belvorine-cert-root .qr .v {
          margin-top: 8px;
          font-size: 10px;
          font-weight: 600;
          font-style: italic;
          line-height: 1.3;
          text-align: center;
          color: #1d1d1f;
        }
        .belvorine-cert-root .qr .v b {
          font-size: 11px;
        }
      `}</style>

      <div className="cert" id="cert" ref={certRef}>
        <div className="frame" />

        {/* Exact Watermark SVG from js/template.js */}
        <svg className="wm" viewBox="0 0 1123 794" aria-hidden="true">
          <defs>
            <pattern
              id="wmp"
              width="320"
              height="90"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-24)"
            >
              <text x="6" y="50" className="wmt">
                BELVORINÉ MIXOLOGY
              </text>
            </pattern>
          </defs>
          <rect width="1123" height="794" fill="url(#wmp)" />
          <g
            transform="translate(561 400) scale(1.55)"
            fill="none"
            stroke="#c8102e"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity=".075"
          >
            <circle r="150" strokeWidth="1.6" />
            <circle r="142" strokeWidth=".8" />
            <path d="M-78,-78 L78,-78 L0,2 Z" />
            <path d="M-60,-62 L60,-62" />
            <path d="M0,2 V82" />
            <ellipse cx="0" cy="86" rx="36" ry="7" />
            <circle cx="22" cy="-40" r="9" />
            <path d="M12,-62 L34,-30" />
          </g>
        </svg>

        {/* Optional Passport-Style Framed Photo inside the certificate border */}
        {certificate.photoDataUrl ? (
          <div className="photo-frame" aria-label="Candidate photo">
            <div className="photo-frame-inner">
              <img src={certificate.photoDataUrl} alt={certificate.name} />
            </div>
          </div>
        ) : null}

        {/* Main Certificate Content */}
        <div className="inner">
          <div className="brand">BELVORINÉ</div>
          <div className="sub">
            <i />
            MIXOLOGY
            <i />
          </div>
          <h1 className="cert-h1">Certificate of Achievement</h1>
          <div className="lead">This is to certify that</div>
          <div
            className="name"
            style={certificate.name.length > 28 ? { fontSize: '34px' } : undefined}
          >
            {certificate.name}
          </div>
          <div className="txt">
            has successfully completed the Belvoriné Mixology
            <br />
            {`Level ${certificate.level} ${certificate.programName} assessment`} and has been
            awarded a certificate in
          </div>
          <div className="award">{renderAwardNodes(certificate.award)}</div>
        </div>

        {/* Bottom 5-Column Footer: Stamp | Signature | Seal | Certificate ID | QR Code */}
        <div className="bottom">
          {/* 1. Circular Issue Date Stamp SVG */}
          <div className="cell">
            <svg className="stamp" viewBox="-80 -80 160 160" aria-label="Issue date stamp">
              <defs>
                <path id="arcTop" d="M -52,0 A 52,52 0 0 1 52,0" />
                <path id="arcBot" d="M -60,0 A 60,60 0 0 0 60,0" />
                <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.9"
                    numOctaves="2"
                    seed="4"
                    result="n"
                  />
                  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
                </filter>
              </defs>
              <g
                filter="url(#ink)"
                fill="none"
                stroke="#26418f"
                opacity=".86"
                transform="rotate(-9)"
              >
                <circle r="74" strokeWidth="3" />
                <circle r="68" strokeWidth="1" />
                <circle r="44" strokeWidth="1" />
                <g fill="#26418f" stroke="none">
                  <text className="st-arc" textAnchor="middle">
                    <textPath href="#arcTop" startOffset="50%" transform="translate(0,0)">
                      BELVORINÉ MIXOLOGY
                    </textPath>
                  </text>
                  <text className="st-arc" textAnchor="middle" transform="translate(0,2)">
                    <textPath href="#arcBot" startOffset="50%">
                      CERTIFICATION
                    </textPath>
                  </text>
                  <text x="0" y="-4" textAnchor="middle" className="st-date">
                    {formattedDate}
                  </text>
                  <text x="0" y="14" textAnchor="middle" className="st-lab">
                    Issue Date
                  </text>
                  <path
                    d="M0 24 l2.4 5 5.4.7-4 3.7 1 5.3-4.8-2.6-4.8 2.6 1-5.3-4-3.7 5.4-.7z"
                    transform="translate(0,2) scale(.8)"
                  />
                </g>
              </g>
            </svg>
          </div>

          {/* 2. Signature + Director Name + Role */}
          <div className="cell">
            <svg className="sign" viewBox="0 0 300 110" aria-label="Signature of Fazle Rabbi">
              <g
                fill="none"
                stroke="#10213f"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  strokeWidth="3.4"
                  d="M46 92 C40 62 50 26 84 15 C104 9 112 24 96 33 C86 39 70 41 58 43"
                />
                <path strokeWidth="2.2" d="M24 62 C70 50 124 44 176 49" />
                <path
                  strokeWidth="2.6"
                  d="M72 80 C80 60 92 58 94 68 C96 80 84 84 92 72 C100 56 114 58 114 70 C114 82 104 86 116 74 C124 64 134 62 138 70 C141 78 132 80 142 68 C150 58 162 58 168 64"
                />
                <path
                  strokeWidth="3.2"
                  d="M182 88 C178 54 190 20 216 15 C236 12 238 34 216 43 C208 47 198 47 194 47 C210 49 226 58 223 74 C222 84 232 86 238 76"
                />
                <path
                  strokeWidth="2.6"
                  d="M238 76 C246 60 256 58 258 68 C259 76 252 82 260 73 C268 62 278 58 281 66 C283 74 276 78 284 70"
                />
                <path strokeWidth="2.4" d="M284 70 C288 62 292 54 296 46" />
                <path strokeWidth="1.8" d="M14 99 C80 108 190 104 296 80" />
                <circle cx="266" cy="52" r="1.8" fill="#10213f" stroke="none" />
              </g>
            </svg>
            <div className="line" />
            <div className="pname">{certificate.directorName || 'Fazle Rabbi'}</div>
            <div className="prole">{certificate.directorRole || 'Program Director'}</div>
          </div>

          {/* 3. Laurel Wreath Verified Seal SVG */}
          <div className="cell">
            <svg className="seal" viewBox="-70 -70 140 140" aria-label="Verified certificate">
              <g fill="#b9b2ad" opacity=".95">
                <ellipse cx="-11.9" cy="44.4" rx="2.8" ry="7.5" transform="rotate(77 -11.9 44.4)" />
                <ellipse cx="-13.5" cy="50.2" rx="2.8" ry="7.5" transform="rotate(133 -13.5 50.2)" />
                <ellipse cx="-21.2" cy="40.8" rx="2.8" ry="7.5" transform="rotate(90 -21.2 40.8)" />
                <ellipse cx="-24.0" cy="46.1" rx="2.8" ry="7.5" transform="rotate(146 -24.0 46.1)" />
                <ellipse cx="-29.6" cy="35.2" rx="2.8" ry="7.5" transform="rotate(102 -29.6 35.2)" />
                <ellipse cx="-33.4" cy="39.8" rx="2.8" ry="7.5" transform="rotate(158 -33.4 39.8)" />
                <ellipse cx="-36.5" cy="28.0" rx="2.8" ry="7.5" transform="rotate(114 -36.5 28.0)" />
                <ellipse cx="-41.3" cy="31.7" rx="2.8" ry="7.5" transform="rotate(170 -41.3 31.7)" />
                <ellipse cx="-41.7" cy="19.4" rx="2.8" ry="7.5" transform="rotate(127 -41.7 19.4)" />
                <ellipse cx="-47.1" cy="22.0" rx="2.8" ry="7.5" transform="rotate(183 -47.1 22.0)" />
                <ellipse cx="-44.9" cy="10.0" rx="2.8" ry="7.5" transform="rotate(140 -44.9 10.0)" />
                <ellipse cx="-50.8" cy="11.3" rx="2.8" ry="7.5" transform="rotate(196 -50.8 11.3)" />
                <ellipse cx="-46.0" cy="0.0" rx="2.8" ry="7.5" transform="rotate(152 -46.0 0.0)" />
                <ellipse cx="-52.0" cy="0.0" rx="2.8" ry="7.5" transform="rotate(208 -52.0 0.0)" />
                <ellipse cx="-44.9" cy="-10.0" rx="2.8" ry="7.5" transform="rotate(164 -44.9 -10.0)" />
                <ellipse cx="-50.8" cy="-11.3" rx="2.8" ry="7.5" transform="rotate(220 -50.8 -11.3)" />
                <ellipse cx="-41.7" cy="-19.4" rx="2.8" ry="7.5" transform="rotate(177 -41.7 -19.4)" />
                <ellipse cx="-47.1" cy="-22.0" rx="2.8" ry="7.5" transform="rotate(233 -47.1 -22.0)" />
                <g transform="scale(-1 1)">
                  <ellipse cx="-11.9" cy="44.4" rx="2.8" ry="7.5" transform="rotate(77 -11.9 44.4)" />
                  <ellipse cx="-13.5" cy="50.2" rx="2.8" ry="7.5" transform="rotate(133 -13.5 50.2)" />
                  <ellipse cx="-21.2" cy="40.8" rx="2.8" ry="7.5" transform="rotate(90 -21.2 40.8)" />
                  <ellipse cx="-24.0" cy="46.1" rx="2.8" ry="7.5" transform="rotate(146 -24.0 46.1)" />
                  <ellipse cx="-29.6" cy="35.2" rx="2.8" ry="7.5" transform="rotate(102 -29.6 35.2)" />
                  <ellipse cx="-33.4" cy="39.8" rx="2.8" ry="7.5" transform="rotate(158 -33.4 39.8)" />
                  <ellipse cx="-36.5" cy="28.0" rx="2.8" ry="7.5" transform="rotate(114 -36.5 28.0)" />
                  <ellipse cx="-41.3" cy="31.7" rx="2.8" ry="7.5" transform="rotate(170 -41.3 31.7)" />
                  <ellipse cx="-41.7" cy="19.4" rx="2.8" ry="7.5" transform="rotate(127 -41.7 19.4)" />
                  <ellipse cx="-47.1" cy="22.0" rx="2.8" ry="7.5" transform="rotate(183 -47.1 22.0)" />
                  <ellipse cx="-44.9" cy="10.0" rx="2.8" ry="7.5" transform="rotate(140 -44.9 10.0)" />
                  <ellipse cx="-50.8" cy="11.3" rx="2.8" ry="7.5" transform="rotate(196 -50.8 11.3)" />
                  <ellipse cx="-46.0" cy="0.0" rx="2.8" ry="7.5" transform="rotate(152 -46.0 0.0)" />
                  <ellipse cx="-52.0" cy="0.0" rx="2.8" ry="7.5" transform="rotate(208 -52.0 0.0)" />
                  <ellipse cx="-44.9" cy="-10.0" rx="2.8" ry="7.5" transform="rotate(164 -44.9 -10.0)" />
                  <ellipse cx="-50.8" cy="-11.3" rx="2.8" ry="7.5" transform="rotate(220 -50.8 -11.3)" />
                  <ellipse cx="-41.7" cy="-19.4" rx="2.8" ry="7.5" transform="rotate(177 -41.7 -19.4)" />
                  <ellipse cx="-47.1" cy="-22.0" rx="2.8" ry="7.5" transform="rotate(233 -47.1 -22.0)" />
                </g>
              </g>
              <text x="0" y="-6" textAnchor="middle" className="seal-v">
                VERIFIED
              </text>
              <text x="0" y="10" textAnchor="middle" className="seal-s">
                CERTIFICATE of
              </text>
              <text x="0" y="22" textAnchor="middle" className="seal-s">
                ACHIEVEMENT
              </text>
            </svg>
          </div>

          {/* 4. Certificate ID */}
          <div className="cell">
            <div className="idbox">{certificate.id}</div>
            <div className="line" />
            Certificate ID
          </div>

          {/* 5. QR Code + Verify Instructions */}
          <div className="qr">
            <div
              className="code"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="v">
              <b>Verify certificate</b>
              <br />
              Scan QR or visit
              <br />
              {certificate.siteHost || 'belvorine.lovable.app'}/verify
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
