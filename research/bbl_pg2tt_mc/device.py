"""
Compact model of a lateral P(g2T-T) | BBL heterojunction electrochemical transistor.

  source --[ P(g2T-T), holes ]--| interface |--[ BBL, electrons ]-- drain
  phi = 0                     phi_a      phi_b                      phi = V_D (< 0)

* Electrochemical doping follows the local gate-channel potential (VG - phi):
    p = p0 / (1 + exp((VG - phi - Vtp)/s)),   n = n0 / (1 + exp(-(VG - phi - Vtn)/s))
* Gradual-channel drift in each polymer (closed-form softplus integrals).
* The interface passes current only by e-h recombination:
    I = q * Vol_j * beta * p_a * n_b * (1 - exp(-(phi_a - phi_b)/kT))
  with beta = zeta * beta_Langevin (zeta: interfacial reduction factor).

Parameter values are order-of-magnitude assumptions, not fitted to data.
"""
import numpy as np
from scipy.optimize import brentq

Q, KT = 1.602e-19, 0.0257
EPS0 = 8.854e-14                       # F/cm

P = dict(
    mu_p=1.0, mu_n=1e-3,               # cm^2/Vs  (P(g2T-T), BBL; assumed)
    p0=1e21, n0=1e21,                  # cm^-3 max electrochemical doping
    Vtp=0.45, Vtn=0.35, s=0.06,        # V: dedoping / doping midpoints, slope
    W=100e-4, t=100e-7,                # cm: width, film thickness
    Lp=25e-4, Ln=25e-4,                # cm: channel lengths of each polymer
    delta=1e-7,                        # cm: interface reaction-zone thickness
    eps_r=3.0,
)


def beta_langevin(par):
    return Q * (par["mu_p"] + par["mu_n"]) / (par["eps_r"] * EPS0)   # cm^3/s


def _sp(x):            # softplus
    return np.logaddexp(0.0, x)


def _isp(y):           # inverse softplus, y > 0
    return np.where(y > 30, y, np.log(np.expm1(np.minimum(y, 30))))


def solve_current(VG, VD, zeta, par=P, full=False):
    s = par["s"]
    cp, cn = VG - par["Vtp"], VG - par["Vtn"]
    gp = Q * par["mu_p"] * par["W"] * par["t"] * par["p0"] * s / par["Lp"]
    gn = Q * par["mu_n"] * par["W"] * par["t"] * par["n0"] * s / par["Ln"]
    Ap = _sp(-cp / s)                       # softplus at source end
    An = _sp((cn - VD) / s)                 # softplus at drain end
    Gj = Q * par["W"] * par["t"] * par["delta"] * zeta * beta_langevin(par)

    def potentials(I):
        phi_a = cp + s * _isp(Ap - I / gp)
        phi_b = cn - s * _isp(An - I / gn)
        return phi_a, phi_b

    def resid(I):
        pa_, pb_ = potentials(I)
        pa = par["p0"] / (1 + np.exp((VG - pa_ - par["Vtp"]) / s))
        nb = par["n0"] / (1 + np.exp(-(VG - pb_ - par["Vtn"]) / s))
        return I - Gj * pa * nb * (-np.expm1(-(pa_ - pb_) / KT))

    Imax = min(gp * Ap, gn * An) * (1 - 1e-12)
    if resid(Imax) < 0:                     # never junction-balanced: channel saturated
        I = Imax
    else:
        I = brentq(resid, 0.0, Imax, xtol=1e-30, rtol=1e-12)
    if not full:
        return I
    pa_, pb_ = potentials(I)
    return I, (pa_ - pb_) / abs(VD)          # current, fraction of V_D dropped at junction


def transfer(VGs, VD, zeta, par=P):
    out = np.array([solve_current(v, VD, zeta, par, full=True) for v in VGs])
    return out[:, 0], out[:, 1]


def sensitivity(VG, VD, zeta, par=P, h=1e-3):
    """d ln I / d ln beta: how much a relative change in recombination shows up in I_D."""
    I1 = solve_current(VG, VD, zeta * (1 + h), par)
    I0 = solve_current(VG, VD, zeta * (1 - h), par)
    return (np.log(I1) - np.log(I0)) / (2 * h)
