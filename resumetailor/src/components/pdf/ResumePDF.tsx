import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { ResumeJSON, ResumeSection } from '@/types/resume'

const styles = StyleSheet.create({
  page: {
    fontFamily:   'Times-Roman',
    fontSize:      9.5,
    color:         '#1a1a1a',
    paddingTop:    48,
    paddingBottom: 48,
    paddingLeft:   54,
    paddingRight:  54,
    lineHeight:    1.45,
  },

  // Header
  name: {
    fontSize:      20,
    fontFamily:    'Times-Bold',
    textAlign:     'center',
    marginBottom:  3,
    letterSpacing: 0.5,
  },
  contact: {
    fontSize:      8,
    textAlign:     'center',
    color:         '#555',
    marginBottom:  10,
    paddingBottom: 8,
    borderBottom:  '1.5pt solid #111',
  },

  // Section title
  sectionTitle: {
    fontSize:      8,
    fontFamily:    'Times-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color:         '#111',
    borderBottom:  '0.5pt solid #ccc',
    paddingBottom: 2,
    marginTop:     10,
    marginBottom:  5,
  },

  // Experience
  expHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-end',
    marginBottom:   1,
  },
  expRole:    { fontSize: 9.5, fontFamily: 'Times-Bold', color: '#111' },
  expDate:    { fontSize: 8,   color: '#666' },
  expCompany: { fontSize: 8.5, color: '#555', marginBottom: 3 },

  // Project / section title row
  projHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-end',
    marginBottom:   2,
  },
  projTitle: { fontSize: 9.5, fontFamily: 'Times-Bold', color: '#111' },
  projDate:  { fontSize: 8,   color: '#666' },

  // Bullets
  bulletRow: {
    flexDirection: 'row',
    marginBottom:  2.5,
  },
  bulletDot: {
    width:           3,
    height:          3,
    borderRadius:    1.5,
    backgroundColor: '#555',
    marginTop:       3.5,
    marginRight:     5,
    flexShrink:      0,
  },
  bulletText: {
    flex:       1,
    fontSize:   9,
    lineHeight: 1.45,
  },

  // Skills
  skillsText: {
    fontSize:   9,
    color:      '#444',
    lineHeight: 1.5,
  },

  // Education
  eduRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   1,
  },
  eduDegree: { fontSize: 9.5, fontFamily: 'Times-Bold' },
  eduYear:   { fontSize: 8,   color: '#666' },
  eduSchool: { fontSize: 8.5, color: '#555' },
})

// ── Sub-components ────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

function BulletRow({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  )
}

function SectionGroup({ section }: { section: ResumeSection }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={styles.projHeader}>
        <Text style={styles.projTitle}>{section.title}</Text>
        {section.date && <Text style={styles.projDate}>{section.date}</Text>}
      </View>
      {section.subtitle && (
        <Text style={{ fontSize: 8.5, color: '#555', marginBottom: 3 }}>
          {section.subtitle}
        </Text>
      )}
      {section.bullets.map(b => (
        <BulletRow key={b.id} text={b.text} />
      ))}
    </View>
  )
}

// ── Main PDF component ────────────────────────────────────

export function ResumePDF({ resume }: { resume: ResumeJSON }) {
  return (
    <Document
      title={resume.name}
      author={resume.name}
      subject="Resume — Tailored by ResumeTailor"
      creator="ResumeTailor"
    >
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <Text style={styles.name}>{resume.name}</Text>
        <Text style={styles.contact}>{resume.contact}</Text>

        {/* Experience */}
        {resume.experience.length > 0 && (
          <>
            <SectionTitle>Experience</SectionTitle>
            {resume.experience.map(exp => (
              <View key={exp.id} style={{ marginBottom: 8 }}>
                <View style={styles.expHeader}>
                  <Text style={styles.expRole}>{exp.role}</Text>
                  <Text style={styles.expDate}>{exp.date}</Text>
                </View>
                <Text style={styles.expCompany}>{exp.company}</Text>
                {exp.bullets.map(b => (
                  <BulletRow key={b.id} text={b.text} />
                ))}
              </View>
            ))}
          </>
        )}

        {/* Skills */}
        <SectionTitle>Skills</SectionTitle>
        <Text style={styles.skillsText}>
          {resume.skills.join('  •  ')}
        </Text>

        {/* Education */}
        <SectionTitle>Education</SectionTitle>
        <View style={styles.eduRow}>
          <Text style={styles.eduDegree}>{resume.education.degree}</Text>
          <Text style={styles.eduYear}>{resume.education.year}</Text>
        </View>
        <Text style={styles.eduSchool}>{resume.education.school}</Text>

        {/* Projects */}
        {(resume.projects ?? []).length > 0 && (
          <>
            <SectionTitle>Projects</SectionTitle>
            {resume.projects.map(proj => (
              <SectionGroup key={proj.id} section={proj} />
            ))}
          </>
        )}

        {/* Extra-Curricular Activities */}
        {(resume.activities ?? []).length > 0 && (
          <>
            <SectionTitle>Extra-Curricular Activities</SectionTitle>
            {resume.activities!.map(act => (
              <SectionGroup key={act.id} section={act} />
            ))}
          </>
        )}

      </Page>
    </Document>
  )
}