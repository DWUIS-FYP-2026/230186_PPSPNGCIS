/**
 * Form 2 — Pre-Parole Report (PPR) section markup.
 */
function pprSectionUpload(inputId, labelText) {
  return `
    <div class="field-with-attachment ppr-section-upload">
      <div class="field-label">${labelText}</div>
      <div class="file-upload-wrapper">
        <label class="btn btn-outline btn-sm ppr-upload-btn" for="${inputId}">Upload supporting documents</label>
        <input type="file" id="${inputId}" class="ppr-file-input" accept=".pdf,.doc,.docx,.jpg,.png" multiple hidden>
        <div class="file-preview" id="${inputId}Preview"></div>
      </div>
    </div>`;
}

const PMSForm2PprTemplate = `
<div class="ppr-shell">
  <div class="ppr-shell__hero">
    <div class="ppr-shell__hero-main">
      <span class="ppr-shell__label">Pre-Parole Report (PPR)</span>
    </div>
    <div class="ppr-shell__hero-actions">
      <button type="button" class="btn btn-outline btn-sm hidden" id="btnEditPpr" data-section-control="true">Edit PPR</button>
      <span class="status-badge pending" id="pprStatus">PENDING</span>
    </div>
  </div>
  <div class="ppr-progress no-print" id="pprProgress">
    <div class="ppr-progress__step" data-ppr-step="dar"><span class="ppr-progress__num">1</span><span>DAR Review</span></div>
    <div class="ppr-progress__step" data-ppr-step="ppr"><span class="ppr-progress__num">2</span><span>PPR Assessment</span></div>
    <div class="ppr-progress__step" data-ppr-step="decision"><span class="ppr-progress__num">3</span><span>Sign-Off &amp; Recommendation</span></div>
  </div>
  <div class="card-body ppr-form-body">

    <section class="ppr-form-card">
      <div class="ppr-section-head">
        <div class="ppr-section-head__title"><span class="ppr-section-num">1</span><h3>Inmate Information</h3></div>
        <span class="ppr-section-ref">Reference: DAR Section A</span>
      </div>
      <div class="ppr-field-grid">
        <div class="form-group"><label>Full Name <span class="required">*</span></label><input type="text" id="pprInmateName" class="readonly-field" readonly></div>
        <div class="form-group"><label>Inmate ID <span class="required">*</span></label><input type="text" id="pprInmateId" class="readonly-field" readonly></div>
        <div class="form-group"><label>Facility <span class="required">*</span></label><input type="text" id="pprFacility" class="readonly-field" readonly></div>
      </div>
      <div class="ppr-field-grid ppr-field-grid--2" style="margin-top:1rem">
        <div class="form-group"><label>Sentence Start Date</label><input type="date" id="pprSentenceStart" class="readonly-field" readonly></div>
        <div class="form-group"><label>Earliest Parole Eligibility Date</label><input type="date" id="pprEligibilityDate" class="readonly-field" readonly></div>
      </div>
      ${pprSectionUpload('pprInmateDocs', 'Inmate record supporting documents')}
    </section>

    <section class="ppr-form-card">
      <div class="ppr-section-head">
        <div class="ppr-section-head__title"><span class="ppr-section-num">2</span><h3>Social Case Study &amp; Background</h3></div>
        <span class="ppr-section-ref">PPR Section A</span>
      </div>
      <div class="ppr-stack">
        <div class="form-group"><label>Family History &amp; Upbringing <span class="required">*</span></label><textarea id="pprFamilyHistory" rows="3" placeholder="Family background, childhood circumstances, and contributing factors…"></textarea><p class="ppr-help">Include family composition, education, and any historical trauma or disadvantage.</p></div>
        <div class="form-group"><label>Long-Term Psychological Standing</label><textarea id="pprPsychologicalStanding" rows="2" placeholder="Psychological assessments, mental health history, behavioral patterns…"></textarea></div>
        <div class="ppr-field-grid ppr-field-grid--2">
          <div class="form-group"><label>Education Level</label><select id="pprEducationLevel"><option value="">Select…</option><option value="primary">Primary School</option><option value="secondary">Secondary School (Some)</option><option value="vocational">Vocational Training</option><option value="tertiary">Tertiary</option></select></div>
          <div class="form-group"><label>Employment History</label><input type="text" id="pprEmploymentHistory" placeholder="Previous employment or livelihood"></div>
        </div>
        ${pprSectionUpload('pprSocialCaseDocs', 'Social case study supporting documents')}
      </div>
    </section>

    <section class="ppr-form-card">
      <div class="ppr-section-head">
        <div class="ppr-section-head__title"><span class="ppr-section-num">3</span><h3>Community Acceptance &amp; Safety</h3></div>
        <span class="ppr-section-ref">PPR Section B · Mandatory Interviews</span>
      </div>
      <div class="ppr-stack">
        <div class="ppr-interview-card">
          <div class="ppr-interview-head"><h4>Village / Community Leader Interview</h4><span class="ppr-badge-mandatory">Mandatory</span></div>
          <div class="ppr-field-grid ppr-field-grid--2">
            <div class="form-group"><label>Leader Name <span class="required">*</span></label><input type="text" id="pprCommunityLeaderName" placeholder="Chief or ward councillor"></div>
            <div class="form-group"><label>Village / Community <span class="required">*</span></label><input type="text" id="pprCommunityVillage" placeholder="Village, province"></div>
          </div>
          <div class="form-group" style="margin-top:0.75rem"><label>Interview Summary &amp; Community Sentiment <span class="required">*</span></label><textarea id="pprCommunityInterview" rows="3" placeholder="Community feedback, concerns, and acceptance…"></textarea></div>
          <div class="form-group"><label>Is the environment safe for the inmate's return?</label>
            <div class="ppr-radio-row">
              <label><input type="radio" name="communitySafety" value="safe"> Safe</label>
              <label><input type="radio" name="communitySafety" value="cautious"> Cautious</label>
              <label><input type="radio" name="communitySafety" value="unsafe"> Unsafe</label>
            </div></div>
        </div>
        <div class="ppr-interview-card">
          <div class="ppr-interview-head"><h4>Local Pastor / Religious Leader Interview</h4><span class="ppr-badge-mandatory">Mandatory</span></div>
          <div class="ppr-field-grid ppr-field-grid--2">
            <div class="form-group"><label>Pastor Name <span class="required">*</span></label><input type="text" id="pprPastorName"></div>
            <div class="form-group"><label>Church / Organization <span class="required">*</span></label><input type="text" id="pprPastorChurch"></div>
          </div>
          <div class="form-group" style="margin-top:0.75rem"><label>Interview Summary &amp; Spiritual Assessment <span class="required">*</span></label><textarea id="pprPastorInterview" rows="3" placeholder="Spiritual assessment and reintegration support…"></textarea></div>
        </div>
        ${pprSectionUpload('pprCommunityDocs', 'Community interview supporting documents')}
      </div>
    </section>

    <section class="ppr-form-card">
      <div class="ppr-section-head">
        <div class="ppr-section-head__title"><span class="ppr-section-num">4</span><h3>Victim Impact Assessment</h3></div>
        <span class="ppr-section-ref">PPR Section C</span>
      </div>
      <div class="ppr-stack">
        <div class="form-group"><label>Victim / Victim's Family Consultation <span class="required">*</span></label><textarea id="victimStatements" rows="3" placeholder="Victim or family feedback and conditions…"></textarea></div>
        <div class="ppr-field-grid ppr-field-grid--2">
          <div class="form-group"><label>Risk of Tribal Conflict or Retaliatory Violence <span class="required">*</span></label>
            <select id="communityRisk">
              <option value="">Select…</option>
              <option value="Low">None / Low Risk</option>
              <option value="Moderate">Moderate Risk</option>
              <option value="High">High Risk</option>
            </select></div>
          <div class="form-group"><label>Victim Impact Statement Received</label>
            <div class="ppr-radio-row">
              <label><input type="radio" name="victimStatementReceived" value="yes"> Yes</label>
              <label><input type="radio" name="victimStatementReceived" value="no"> No</label>
              <label><input type="radio" name="victimStatementReceived" value="pending"> Pending</label>
            </div></div>
        </div>
        ${pprSectionUpload('pprVictimImpactDocs', 'Victim impact supporting documents')}
      </div>
    </section>

    <section class="ppr-form-card">
      <div class="ppr-section-head">
        <div class="ppr-section-head__title"><span class="ppr-section-num">5</span><h3>Post-Release Reintegration Plan</h3></div>
        <span class="ppr-section-ref">PPR Section D</span>
      </div>
      <div class="ppr-stack">
        <div class="ppr-field-grid ppr-field-grid--2">
          <div class="form-group"><label>Proposed Residence (Verified) <span class="required">*</span></label><input type="text" id="verifiedResidence" placeholder="Village, ward, or district"></div>
          <div class="form-group"><label>Employment / Livelihood Plan <span class="required">*</span></label><input type="text" id="pprEmploymentPlan" placeholder="Employment or subsistence plan"></div>
        </div>
        <div class="ppr-field-grid ppr-field-grid--2">
          <div class="form-group"><label>Voluntary Parole Officer (VPO) Name <span class="required">*</span></label><input type="text" id="pprVpoName" placeholder="Community supervisor"></div>
          <div class="form-group"><label>VPO Contact <span class="required">*</span></label><input type="text" id="pprVpoContact" placeholder="Phone or email"></div>
        </div>
        <input type="hidden" id="sponsorName"><input type="hidden" id="sponsorRelationship" value="VPO"><input type="hidden" id="sponsorCapability" value="Adequate">
        <div class="form-group"><label>Accommodation Stability <span class="required">*</span></label>
          <select id="accommodationStability"><option value="">Select…</option><option value="Stable">Stable — Secure and suitable</option><option value="Temporary">Temporary — Short-term</option><option value="Unstable">Unstable — Not suitable</option></select></div>
        <div class="form-group"><label>Reintegration Support &amp; Supervision Plan <span class="required">*</span></label><textarea id="reintegrationPlan" rows="2" placeholder="Supervision plan and support network…"></textarea></div>
        ${pprSectionUpload('pprReintegrationDocs', 'Reintegration plan supporting documents')}
      </div>
    </section>

    <section class="ppr-form-card">
      <div class="ppr-section-head">
        <div class="ppr-section-head__title"><span class="ppr-section-num">6</span><h3>Sign-Off &amp; Recommendation</h3></div>
        <span class="ppr-section-ref">PPR Section E</span>
      </div>
      <div class="ppr-stack">
        <div class="form-group"><label>PPR Recommendation <span class="required">*</span></label>
          <div class="ppr-rec-grid">
            <label class="ppr-rec-option ppr-rec-option--green"><input type="radio" name="pprRecommendation" value="recommend" checked> Recommend Parole</label>
            <label class="ppr-rec-option ppr-rec-option--amber"><input type="radio" name="pprRecommendation" value="defer"> Defer</label>
            <label class="ppr-rec-option ppr-rec-option--rose"><input type="radio" name="pprRecommendation" value="deny"> Deny Parole</label>
          </div></div>
        <div class="form-group"><label>Recommendation Justification <span class="required">*</span></label><textarea id="pprRecommendationJustification" rows="3" placeholder="Justification referencing DAR, PPR, and board interview…"></textarea></div>
        <div class="ppr-signoff-box ppr-field-grid ppr-field-grid--2">
          <div class="form-group"><label>Parole Officer Name <span class="required">*</span></label><input type="text" id="pprOfficer" placeholder="Assessing officer"></div>
          <div class="form-group"><label>Report Date <span class="required">*</span></label><input type="date" id="pprDate"></div>
        </div>
        ${pprSectionUpload('pprSignoffDocs', 'Sign-off and restorative justice supporting documents')}
        <input type="hidden" id="communityStatements"><input type="hidden" id="sponsorNotes"><input type="hidden" id="customarySettlement"><input type="hidden" id="restorativeAssessment">
      </div>
    </section>

    <div class="ppr-actions no-print card-actions" data-section-actions="ppr">
      <button type="button" class="btn btn-outline btn-sm" id="btnResetPpr" data-section-control="true">Reset Section</button>
      <button type="button" class="btn btn-primary btn-sm" id="btnSavePpr" data-section-control="true">Save Draft</button>
      <button type="button" class="btn btn-success btn-sm btn-submit-ppr" id="btnSubmitPpr" data-section-control="true">Submit PPR to Parole Board</button>
    </div>
    <p class="ppr-footer-note no-print">PPR v2.0 · DJAG Community Corrections · All data stored securely in PMS</p>
  </div>
</div>`;

function mountForm2PprSection() {
  const card = document.getElementById('pprCard');
  if (card && !card.querySelector('.ppr-shell')) {
    card.innerHTML = PMSForm2PprTemplate;
  }
}
