"""
BBL / P(g2T-T) heterojunction magnetoconductance (MC) simulation.

Model: electron (BBL, n-type) - hole (P(g2T-T), p-type) polaron pair formed at the
interface with random spin (rho0 = I/4). Static, isotropic Gaussian hyperfine fields
(semiclassical), Zeeman with Delta-g, Haberkorn spin-selective recombination
(k_S, k_T) and spin-independent dissociation (k_d). Pair yields are obtained exactly
from the time-integrated density matrix (eigen-decomposition of H_eff).

Device: series network R_p (P(g2T-T) channel) + R_j (interface) + R_n (BBL channel).
Interface current requires e-h recombination, so R_j ~ 1 / (kappa * Phi_rec * n * p).

All parameters are assumptions for illustration, not fitted to data.
"""
import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import curve_fit

GAMMA = 1.7609e8          # rad s^-1 mT^-1 (g = 2.0023)
G0 = 2.0023

# --- spin operators (basis uu, ud, du, dd) ---
sx = np.array([[0, 1], [1, 0]]) / 2
sy = np.array([[0, -1j], [1j, 0]]) / 2
sz = np.array([[1, 0], [0, -1]]) / 2
I2 = np.eye(2)
S1 = [np.kron(s, I2) for s in (sx, sy, sz)]
S2 = [np.kron(I2, s) for s in (sx, sy, sz)]
singlet = np.array([0, 1, -1, 0]) / np.sqrt(2)
PS = np.outer(singlet, singlet).astype(complex)
PT = np.eye(4) - PS


def pair_yields(B, h1, h2, kS, kT, kd, dg=0.0):
    """Recombination yield Phi_S + Phi_T averaged over hyperfine samples.
    B, hyperfine in mT; rates in s^-1; dg = g_e - g_h."""
    kS, kT, kd = kS / GAMMA, kT / GAMMA, kd / GAMMA      # -> mT units
    g1, g2 = 1 + dg / (2 * G0), 1 - dg / (2 * G0)
    f1 = h1.copy(); f1[:, 2] += g1 * B
    f2 = h2.copy(); f2[:, 2] += g2 * B
    H = sum(f1[:, i, None, None] * S1[i] + f2[:, i, None, None] * S2[i] for i in range(3))
    K = kS * PS + kT * PT + kd * np.eye(4)
    Heff = H - 0.5j * K
    lam, V = np.linalg.eig(Heff)
    Vi = np.linalg.inv(V)
    rho0 = np.eye(4) / 4
    r0 = Vi @ rho0 @ np.conj(np.transpose(Vi, (0, 2, 1)))
    denom = 1j * (lam[:, :, None] - np.conj(lam[:, None, :]))
    rint = V @ (r0 / denom) @ np.conj(np.transpose(V, (0, 2, 1)))
    phiS = kS * np.real(np.einsum('ij,nji->n', PS, rint))
    phiT = kT * np.real(np.einsum('ij,nji->n', PT, rint))
    return np.mean(phiS + phiT)


def mc_curve(Bs, **kw):
    phi = np.array([pair_yields(B, **kw) for B in Bs])
    phi0 = pair_yields(0.0, **kw)
    return phi / phi0 - 1, phi0


def nonlorentz(B, A, B0):
    return A * B**2 / (np.abs(B) + B0) ** 2


# --- hyperfine samples (common random numbers across B) ---
rng = np.random.default_rng(0)
N = 4000
a_h, a_e = 1.0, 0.5       # rms hyperfine field [mT]: P(g2T-T) hole, BBL electron (assumed)
h_hole = rng.normal(0, a_h / np.sqrt(3), (N, 3))
h_elec = rng.normal(0, a_e / np.sqrt(3), (N, 3))
base = dict(h1=h_elec, h2=h_hole, kd=3e7)
kS = 1e8

# (a) low field, spin-selectivity sweep
B_low = np.linspace(-20, 20, 81)
ratios = [3, 10, 100]
low = {}
for r in ratios:
    mc, phi0 = mc_curve(B_low, kS=kS, kT=kS / r, **base)
    (A, B0), _ = curve_fit(nonlorentz, B_low, mc, p0=(mc[-1], 1.0))
    low[r] = mc
    print(f"kS/kT={r:>4}: Phi_rec(0)={phi0:.3f}  MC(20mT)={mc[-1]*100:+.2f}%  "
          f"fit A={A*100:+.2f}%  B0={B0:.2f} mT")

# (b) high field, Delta-g
B_high = np.unique(np.concatenate([np.linspace(-1000, 1000, 81), np.linspace(-20, 20, 41)]))
dgs = [0.0, 1e-3, 3e-3]
high = {}
for dg in dgs:
    mc, _ = mc_curve(B_high, kS=kS, kT=kS / 10, dg=dg, **base)
    high[dg] = mc
    print(f"dg={dg:.0e}: MC(100mT)={np.interp(100, B_high, mc)*100:+.2f}%  "
          f"MC(1T)={mc[-1]*100:+.2f}%")

# (c,d) device: transfer curve and MC(V_G) at B = 100 mT
V = np.linspace(0, 1, 201)
p = 1 / (1 + np.exp((V - 0.45) / 0.05))     # P(g2T-T) dedoped as V_G increases
n = 1 / (1 + np.exp(-(V - 0.55) / 0.05))    # BBL n-doped as V_G increases
eps = 1e-4
mc_j, phi0 = mc_curve(np.array([100.0]), kS=kS, kT=kS / 10, **base)
mc_j = mc_j[0]
dev = {}
for label, kappa in [("junction-limited (κ = 2)", 2.0), ("channel-limited (κ = 200)", 200.0)]:
    Rp, Rn = 1 / (p + eps), 1 / (n + eps)
    Rj0 = 1 / (kappa * phi0 * n * p + eps)
    I0 = 1 / (Rp + Rn + Rj0)
    IB = 1 / (Rp + Rn + Rj0 / (1 + mc_j))
    dev[label] = (I0, IB / I0 - 1, Rj0 / (Rp + Rn + Rj0))
    k = np.argmax(I0)
    print(f"{label}: peak V={V[k]:.2f}  R_j/R_tot at peak={dev[label][2][k]:.2f}  "
          f"MC(100mT) at peak={dev[label][1][k]*100:+.2f}%")

# --- plot ---
C = ["#2a78d6", "#eb6834", "#1baf7a"]
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#52514e", "axes.labelcolor": "#0b0b0b",
                     "xtick.color": "#52514e", "ytick.color": "#52514e"})
fig, ax = plt.subplots(2, 2, figsize=(11, 8.2), facecolor="#fcfcfb")
for a in ax.flat:
    a.set_facecolor("#fcfcfb"); a.grid(color="#e4e3df", lw=0.6); a.axhline(0, color="#8a8984", lw=0.8)

for c, r in zip(C, ratios):
    ax[0, 0].plot(B_low, low[r] * 100, color=c, lw=2, label=f"$k_S/k_T$ = {r}")
ax[0, 0].set(xlabel="B (mT)", ylabel="MC (%)", title="(a) Low field: hyperfine (e–h pair) MC")
ax[0, 0].legend(frameon=False, loc="lower right", bbox_to_anchor=(1, 0.3))

for c, dg in zip(C, dgs):
    ax[0, 1].plot(B_high, high[dg] * 100, color=c, lw=2,
                  label="Δg = 0" if dg == 0 else f"Δg = {dg:.0e}")
ax[0, 1].set(xlabel="B (mT)", ylabel="MC (%)", title="(b) High field: Δg mechanism ($k_S/k_T$ = 10)")
ax[0, 1].legend(frameon=False)

for c, (label, (I0, mcv, fj)) in zip(C, dev.items()):
    ax[1, 0].plot(V, I0 / I0.max(), color=c, lw=2, label=label)
    ax[1, 1].plot(V, mcv * 100, color=c, lw=2, label=label)
ax[1, 0].set(xlabel="$V_G$ (normalized)", ylabel="$I_D$ / $I_{D,max}$",
             title="(c) Simulated transfer curve (NDT peak)")
ax[1, 1].set(xlabel="$V_G$ (normalized)", ylabel="MC at 100 mT (%)",
             title="(d) MC vs $V_G$ at B = 100 mT")
ax[1, 0].legend(frameon=False); ax[1, 1].legend(frameon=False)
fig.tight_layout()
fig.savefig(__file__.replace("simulate_mc.py", "mc_simulation.png"), dpi=160, facecolor=fig.get_facecolor())
